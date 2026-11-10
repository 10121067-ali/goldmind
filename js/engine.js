import * as I from './indicators.js';
import { STRATEGIES } from './strategies.js';
import { nearestZones, orderBlocks, fairValueGaps, fibonacci, pivotsFor, structure } from './levels.js';

export const WARMUP = 210;

export function buildContext(candles, barMs) {
  const t = candles.map(k => k.t), o = candles.map(k => k.o), h = candles.map(k => k.h),
    l = candles.map(k => k.l), c = candles.map(k => k.c);
  return {
    t, o, h, l, c, barMs, n: c.length,
    atr: I.atr(h, l, c, 14),
    ema9: I.ema(c, 9), ema21: I.ema(c, 21), ema50: I.ema(c, 50), ema200: I.ema(c, 200),
    rsi: I.rsi(c, 14), macd: I.macd(c), bb: I.bollinger(c), stoch: I.stochastic(h, l, c),
    adx: I.adx(h, l, c), st: I.supertrend(h, l, c), ichi: I.ichimoku(h, l), psar: I.psar(h, l),
    don: I.donchian(h, l, 20), cci: I.cci(h, l, c), sw: I.swings(h, l, 3, 3),
  };
}

// Regime-adaptive weights: in strong trends trust trend/breakout strategies,
// in ranges trust mean-reversion.
function regimeOf(ctx, i) {
  const a = ctx.adx.adx[i];
  if (!(a >= 0)) return { id: 'unknown', mult: {} };
  if (a >= 25) return { id: 'trend', adx: a, mult: { trend: 1.3, breakout: 1.3, reversion: 0.6 } };
  if (a < 20) return { id: 'range', adx: a, mult: { trend: 0.6, breakout: 0.7, reversion: 1.3 } };
  return { id: 'mixed', adx: a, mult: {} };
}

export function votesAt(ctx, i) {
  const regime = regimeOf(ctx, i);
  const votes = STRATEGIES.map(s => {
    let r;
    try { r = s.run(ctx, i); } catch { r = { v: 0, why: { ar: 'خطأ بالحساب', en: 'Calc error' } }; }
    const w = s.w * (regime.mult[s.cat] ?? 1);
    return { id: s.id, cat: s.cat, w, v: r.v, why: r.why };
  });
  return { votes, regime };
}

export function score(votes) {
  let num = 0, den = 0, agreeW = 0, activeW = 0;
  for (const x of votes) { num += x.v * x.w; den += x.w; }
  const s = den ? (100 * num) / den : 0;
  const dir = Math.sign(s);
  for (const x of votes) {
    if (Math.abs(x.v) < 0.25) continue;
    activeW += x.w * Math.abs(x.v);
    if (Math.sign(x.v) === dir) agreeW += x.w * Math.abs(x.v);
  }
  return { score: s, agreement: activeW ? agreeW / activeW : 0 };
}

export const THRESH = { score: 18, agreement: 0.62, strongScore: 32, strongAgreement: 0.72 };

function classify(s, agreement) {
  if (Math.abs(s) >= THRESH.score && agreement >= THRESH.agreement) {
    const strong = Math.abs(s) >= THRESH.strongScore && agreement >= THRESH.strongAgreement;
    return { dir: Math.sign(s), strength: strong ? 'strong' : 'normal' };
  }
  return { dir: 0, strength: 'none' };
}

// Bias of a (higher-timeframe) context at its last bar, in [-1, 1].
export function bias(ctx) {
  const i = ctx.n - 1;
  const picks = ['ema_trend', 'supertrend', 'smc', 'ichimoku', 'macd'];
  const { votes } = votesAt(ctx, i);
  const sel = votes.filter(v => picks.includes(v.id));
  const w = sel.reduce((a, v) => a + v.w, 0);
  return w ? sel.reduce((a, v) => a + v.v * v.w, 0) / w : 0;
}

export function tradePlan(ctx, i, dir, price) {
  const a = ctx.atr[i];
  const { support, resistance } = nearestZones(ctx, i);
  let sl;
  if (dir > 0) {
    const s = support.find(z => price - z.low > 0.5 * a);
    sl = s ? s.low - 0.2 * a : price - 1.5 * a;
    sl = Math.min(Math.max(sl, price - 3 * a), price - 1.0 * a);
  } else {
    const r = resistance.find(z => z.high - price > 0.5 * a);
    sl = r ? r.high + 0.2 * a : price + 1.5 * a;
    sl = Math.max(Math.min(sl, price + 3 * a), price + 1.0 * a);
  }
  const risk = Math.abs(price - sl);
  const tp1 = price + dir * risk, tp2 = price + dir * 2 * risk;
  let tp3 = price + dir * 3 * risk;
  const opp = dir > 0 ? resistance : support;
  // TP3 snaps to the first opposing zone between 2.5R and 5R; otherwise 3R.
  const edge = z => (dir > 0 ? z.low - 0.1 * a : z.high + 0.1 * a);
  const beyond = opp.find(z => { const r = dir * (edge(z) - price) / risk; return r >= 2.5 && r <= 5; });
  if (beyond) tp3 = edge(beyond);
  // Better (limit) entry at the nearest same-side zone within 1.5 ATR.
  let limit = null;
  const near = (dir > 0 ? support : resistance).find(z => Math.abs(price - (dir > 0 ? z.high : z.low)) < 1.5 * a);
  if (near) limit = dir > 0 ? Math.min(price, near.high) : Math.max(price, near.low);
  if (limit !== null && Math.abs(limit - price) < 0.15 * a) limit = null;
  return { entry: price, limit, sl, tp1, tp2, tp3, risk, atr: a };
}

// Full live analysis at the last bar, with optional higher-timeframe and
// intermarket (DXY) contexts.
export function analyze(ctx, { htf = null, dxy = null, isMetal = false, livePrice = null } = {}) {
  const i = ctx.n - 1;
  const { votes, regime } = votesAt(ctx, i);
  const extra = [];
  let htfBias = null, dxyBias = null;
  if (htf && htf.n > WARMUP) {
    htfBias = bias(htf);
    extra.push({
      id: 'mtf', cat: 'trend', w: 1.5, v: htfBias,
      why: htfBias > 0.3 ? { ar: 'الفريم الأكبر صاعد', en: 'Higher timeframe bullish' }
        : htfBias < -0.3 ? { ar: 'الفريم الأكبر هابط', en: 'Higher timeframe bearish' }
          : { ar: 'الفريم الأكبر حيادي', en: 'Higher timeframe neutral' },
    });
  }
  if (isMetal && dxy && dxy.n > WARMUP) {
    dxyBias = bias(dxy);
    extra.push({
      id: 'dxy', cat: 'trend', w: 1.0, v: -dxyBias,
      why: dxyBias > 0.3 ? { ar: 'الدولار قوي: ضغط على المعادن', en: 'Strong dollar: pressure on metals' }
        : dxyBias < -0.3 ? { ar: 'الدولار ضعيف: دعم للمعادن', en: 'Weak dollar: supports metals' }
          : { ar: 'الدولار حيادي', en: 'Dollar neutral' },
    });
  }
  const all = votes.concat(extra);
  const sc = score(all);
  let cls = classify(sc.score, sc.agreement);
  let note = null;
  if (cls.dir !== 0 && htfBias !== null && Math.sign(htfBias) === -cls.dir && Math.abs(htfBias) >= 0.5) {
    note = { ar: 'الإشارة عكس اتجاه الفريم الأكبر، فالأفضل الانتظار', en: 'Signal is against the higher timeframe trend, so waiting is better' };
    cls = { dir: 0, strength: 'none' };
  }
  const price = livePrice ?? ctx.c[i];
  let confidence = Math.round(sc.agreement * 100);
  if (htfBias !== null && cls.dir !== 0 && Math.sign(htfBias) === cls.dir) confidence = Math.min(95, confidence + 5);
  confidence = Math.min(confidence, 95);
  const plan = cls.dir !== 0 ? tradePlan(ctx, i, cls.dir, price) : null;
  const top = all.filter(v => cls.dir !== 0 ? Math.sign(v.v) === cls.dir : Math.abs(v.v) >= 0.5)
    .sort((a, b) => Math.abs(b.v * b.w) - Math.abs(a.v * a.w)).slice(0, 4);
  return {
    dir: cls.dir, strength: cls.strength, score: sc.score, agreement: sc.agreement, confidence,
    regime, votes: all, plan, top, note, htfBias, dxyBias, price, atr: ctx.atr[i], time: ctx.t[i],
  };
}

// Zones for the analysis page.
export function zonesReport(ctx) {
  const i = ctx.n - 1;
  const { support, resistance } = nearestZones(ctx, i);
  return {
    support: support.slice(0, 4), resistance: resistance.slice(0, 4),
    ob: orderBlocks(ctx, i), fvg: fairValueGaps(ctx, i),
    fib: fibonacci(ctx, i), pivots: pivotsFor(ctx, i), structure: structure(ctx, i),
  };
}

// Combined score and agreement at every past bar (no look-ahead). Shared by the
// backtest and the forecast so the expensive per-bar votes run once.
export function history(ctx) {
  const sc = new Float64Array(ctx.n).fill(NaN), ag = new Float64Array(ctx.n).fill(NaN);
  for (let i = WARMUP; i < ctx.n; i++) {
    const s = score(votesAt(ctx, i).votes);
    sc[i] = s.score; ag[i] = s.agreement;
  }
  return { sc, ag };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
};

// Empirical forecast: on past bars whose combined score was close to today's,
// how often was price higher `bars` later? Overlapping windows are far from
// independent, so the effective sample size is ~samples/bars and the result is
// shrunk toward the unconditional rate accordingly (prior weight PRIOR_N).
// Moves are % returns rescaled by today's volatility relative to the median
// (per-bar ATR is unusable as a scale: quiet weekend bars make it explode).
const PRIOR_N = 12;
export function forecast(ctx, hist, s, horizons, price) {
  const i = ctx.n - 1;
  const volPct = [];
  for (let j = WARMUP; j < ctx.n; j++) if (ctx.atr[j] > 0) volPct.push(ctx.atr[j] / ctx.c[j]);
  volPct.sort((x, y) => x - y);
  const volRatio = volPct.length ? (ctx.atr[i] / ctx.c[i]) / quantile(volPct, 0.5) : 1;
  return horizons.map(({ bars, label }) => {
    const all = [], near = [], wide = [];
    for (let j = WARMUP; j + bars < ctx.n; j++) {
      if (Number.isNaN(hist.sc[j])) continue;
      const m = (ctx.c[j + bars] - ctx.c[j]) / ctx.c[j];
      all.push(m);
      const d = Math.abs(hist.sc[j] - s);
      if (d <= 10) near.push(m);
      if (d <= 20) wide.push(m);
    }
    if (all.length < bars * 5) return null;
    const minN = Math.max(40, bars * 4);
    const set = near.length >= minN ? near : wide.length >= minN ? wide : all;
    const base = all.filter(m => m > 0).length / all.length;
    const raw = set.filter(m => m > 0).length / set.length;
    const nEff = set.length / bars;
    const w = set === all ? 0 : nEff / (nEff + PRIOR_N);
    const sAll = [...all].sort((x, y) => x - y), sSet = [...set].sort((x, y) => x - y);
    const shift = w * (quantile(sSet, 0.5) - quantile(sAll, 0.5));
    const at = q => price * (1 + (quantile(sAll, q) + shift) * volRatio);
    return {
      bars, label, samples: set.length, similar: set !== all, pUp: base + w * (raw - base), baseUp: base,
      mid: at(0.5), lo: at(0.2), hi: at(0.8),
    };
  }).filter(Boolean);
}

// Ready-made conditional plans around the nearest zones, useful when the engine
// says wait: limit entries at the zones and stop entries on a breakout.
export function scenarios(ctx, price, lean) {
  const i = ctx.n - 1, a = ctx.atr[i];
  if (!(a > 0)) return [];
  const { support, resistance } = nearestZones(ctx, i);
  const sup = support.find(z => z.high < price && price - z.high <= 4 * a);
  const res = resistance.find(z => z.low > price && z.low - price <= 4 * a);
  const mk = (type, dir, entry, sl) => {
    const risk = Math.max(Math.abs(entry - sl), 0.8 * a);
    return {
      type, dir, entry, sl: entry - dir * risk, tp1: entry + dir * risk, tp2: entry + dir * 2 * risk,
      likely: Math.sign(lean) === dir && Math.abs(lean) >= 8,
    };
  };
  const out = [];
  if (sup) out.push(mk('buyLimit', 1, sup.high, sup.low - 0.2 * a));
  if (res) out.push(mk('sellLimit', -1, res.low, res.high + 0.2 * a));
  if (res) out.push(mk('buyStop', 1, res.high + 0.1 * a, res.mid - 0.2 * a));
  if (sup) out.push(mk('sellStop', -1, sup.low - 0.1 * a, sup.mid + 0.2 * a));
  return out;
}

// Honest walk-forward backtest of the combined signal (no look-ahead):
// enter at the close of the signal bar, take half at 1R and move the stop to
// breakeven, exit the rest at 2R. A bar touching both SL and TP counts as a loss.
export function backtest(ctx, hist = history(ctx), { maxHold = 48 } = {}) {
  const trades = [];
  let i = WARMUP;
  while (i < ctx.n - 2) {
    const cls = classify(hist.sc[i], hist.ag[i]);
    if (cls.dir === 0) { i++; continue; }
    const p = tradePlan(ctx, i, cls.dir, ctx.c[i]);
    const d = cls.dir;
    let r = null, half = false, stop = p.sl, j = i + 1;
    for (; j < ctx.n && j <= i + maxHold; j++) {
      const hi = ctx.h[j], lo = ctx.l[j];
      const hitSL = d > 0 ? lo <= stop : hi >= stop;
      const hitT1 = d > 0 ? hi >= p.tp1 : lo <= p.tp1;
      const hitT2 = d > 0 ? hi >= p.tp2 : lo <= p.tp2;
      if (!half) {
        if (hitSL) { r = -1; break; }
        if (hitT1) { half = true; stop = p.entry; if (hitT2) { r = 1.5; break; } continue; }
      } else {
        if (hitSL) { r = 0.5; break; }
        if (hitT2) { r = 1.5; break; }
      }
    }
    if (r === null) {
      if (j >= ctx.n) break; // still open at the end of data: not counted
      const exit = ctx.c[Math.min(j, ctx.n - 1)];
      const open = ((exit - p.entry) * d) / p.risk;
      r = half ? 0.5 + 0.5 * open : open;
    }
    trades.push({ i, dir: d, r, tp1: half || r >= 1 });
    i = j + 1;
  }
  const n = trades.length;
  const wins = trades.filter(t => t.r > 0).length;
  const gross = trades.filter(t => t.r > 0).reduce((a, t) => a + t.r, 0);
  const loss = -trades.filter(t => t.r < 0).reduce((a, t) => a + t.r, 0);
  return {
    trades: n, winRate: n ? wins / n : 0, tp1Rate: n ? trades.filter(t => t.tp1).length / n : 0,
    avgR: n ? trades.reduce((a, t) => a + t.r, 0) / n : 0,
    profitFactor: loss ? gross / loss : (gross ? Infinity : 0),
    bars: ctx.n - WARMUP,
  };
}
