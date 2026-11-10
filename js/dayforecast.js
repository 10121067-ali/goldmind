// Intraday projection ("today's expected chart") as a probability fan:
// - hour-of-day volatility profile measured from the market's own history
//   (Asia quiet, London/NY opens busy), rescaled to today's realised volatility;
// - extra variance at scheduled economic events;
// - drift from the strategies' empirical forecast (excess over the base rate),
//   faded in over the forecast horizon and held flat afterwards;
// - probability of touching each key level before the end of the window
//   (Brownian motion with drift, first-passage formula).

const SQ2 = Math.SQRT2;
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const Phi = (z) => 0.5 * (1 + erf(z / SQ2));
export function invPhi(p) {
  p = Math.min(0.999, Math.max(0.001, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q === null) {
    const r = (p - 0.5) * (p - 0.5), x = p - 0.5;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * x / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const v = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return p < 0.5 ? v : -v;
}

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Robust per-bar sigma (log-return) for each UTC hour.
function hourProfile(ctx) {
  const by = Array.from({ length: 24 }, () => []), all = [];
  for (let j = 1; j < ctx.n; j++) {
    if (ctx.t[j] - ctx.t[j - 1] !== ctx.barMs) continue;
    const r = Math.log(ctx.c[j] / ctx.c[j - 1]);
    const h = new Date(ctx.t[j]).getUTCHours();
    by[h].push(Math.abs(r)); all.push(Math.abs(r));
  }
  // MAD-style estimate, inflated a little for fat tails.
  const k = 1.4826 * 1.15;
  const overall = median(all) * k || 1e-4;
  return by.map(a => (a.length >= 8 ? median(a) * k : overall));
}

// Brownian first-passage probability of reaching distance d>0 within the
// window, given drift mu (toward the level positive) and sd at the end.
function touchProb(d, mu, sd) {
  if (d <= 0) return 1;
  if (!(sd > 0)) return mu >= d ? 1 : 0;
  const a = Phi((mu - d) / sd);
  const b = Math.exp(Math.min(50, (2 * mu * d) / (sd * sd))) * Phi((-d - mu) / sd);
  return Math.min(0.99, Math.max(0.01, a + b));
}

export function dayProjection(ctx, res, levels, events, { now = Date.now() } = {}) {
  const barMs = ctx.barMs;
  const price = res.price;
  const lastT = ctx.t[ctx.n - 1];
  const t0 = Math.max(now, lastT);

  // Window: until local midnight; if less than 6h are left, until the next one.
  const mid = new Date(t0); mid.setHours(24, 0, 0, 0);
  let end = mid.getTime();
  if (end - t0 < 6 * 36e5) end += 864e5;
  const dayStart = new Date(t0); dayStart.setHours(0, 0, 0, 0);
  const start = Math.min(dayStart.getTime(), t0 - 8 * 36e5);

  const prof = hourProfile(ctx);
  // Today's activity vs. the usual profile, over the last 8 hours of bars.
  let num = 0, den = 0;
  for (let j = Math.max(1, ctx.n - 32); j < ctx.n; j++) {
    if (ctx.t[j] - ctx.t[j - 1] !== barMs) continue;
    const r = Math.log(ctx.c[j] / ctx.c[j - 1]);
    num += r * r; den += prof[new Date(ctx.t[j]).getUTCHours()] ** 2;
  }
  const volRatio = den ? Math.min(2.5, Math.max(0.6, Math.sqrt(num / den))) : 1;

  // Drift: excess probability over the base rate, converted to a mean move.
  const fc = (res.forecast || []).find(f => f.bars >= 12) || (res.forecast || [])[0];
  const H = fc ? fc.bars : 16;
  let sdH = 0;
  for (let k = 1; k <= H; k++) sdH += (prof[new Date(t0 + k * barMs).getUTCHours()] * volRatio) ** 2;
  sdH = Math.sqrt(sdH);
  const zEx = fc ? invPhi(fc.pUp) - invPhi(fc.baseUp) : 0;
  const muH = zEx * sdH; // log-return

  const evs = events.filter(e => e.time > t0 && e.time <= end && e.impact !== 'Holiday');
  const K = Math.max(1, Math.ceil((end - t0) / barMs));
  const path = [{ t: t0, mid: price, lo60: price, hi60: price, lo90: price, hi90: price }];
  let v = 0;
  for (let k = 1; k <= K; k++) {
    const t = t0 + k * barMs;
    const s = prof[new Date(t).getUTCHours()] * volRatio;
    v += s * s;
    for (const e of evs) {
      if (e.time > t - barMs && e.time <= t) {
        const w = e.impact === 'High' ? (e.country === 'USD' ? 3 : 1.8) : 1.3;
        v += (w * s) ** 2;
      }
    }
    const mu = muH * Math.min(1, k / H);
    const sd = Math.sqrt(v);
    const at = (z) => price * Math.exp(mu + z * sd);
    path.push({ t, mid: at(0), lo60: at(-0.8416), hi60: at(0.8416), lo90: at(-1.6449), hi90: at(1.6449), mu, sd });
  }
  const last = path[path.length - 1];

  const lv = levels.map(L => {
    const d = Math.log(L.price / price);
    const p = d >= 0 ? touchProb(d, last.mu, last.sd) : touchProb(-d, -last.mu, last.sd);
    return { ...L, pTouch: p };
  });

  return {
    start, t0, end, barMs, price, volRatio, path, levels: lv,
    pUpClose: Phi(last.mu / last.sd),
    close60: [last.lo60, last.hi60],
    expHigh: price * Math.exp(Math.max(0, last.mu) + 0.674 * last.sd),
    expLow: price * Math.exp(Math.min(0, last.mu) - 0.674 * last.sd),
    events: events.filter(e => e.time >= start && e.time <= end),
  };
}
