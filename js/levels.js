// Price levels and zones: support/resistance clusters, daily pivots, Fibonacci,
// Smart-Money order blocks / fair value gaps and market structure.
// All functions take (ctx, i) and only use information available at bar i.

const LOOKBACK = 300;

export function activeSwings(ctx, i, lookback = LOOKBACK) {
  const from = i - lookback;
  return {
    highs: ctx.sw.highs.filter(p => p.confirm <= i && p.i >= from),
    lows: ctx.sw.lows.filter(p => p.confirm <= i && p.i >= from),
  };
}

// Cluster swing points into zones. Zones touched more often are stronger.
export function srZones(ctx, i) {
  const a = ctx.atr[i];
  if (!a) return [];
  const { highs, lows } = activeSwings(ctx, i);
  const pts = highs.map(p => ({ ...p, kind: 'H' })).concat(lows.map(p => ({ ...p, kind: 'L' })))
    .sort((x, y) => x.price - y.price);
  const tol = 0.6 * a;
  const zones = [];
  for (const p of pts) {
    const z = zones[zones.length - 1];
    if (z && p.price - z.high <= tol) {
      z.high = Math.max(z.high, p.price); z.low = Math.min(z.low, p.price);
      z.touches++; z.last = Math.max(z.last, p.i);
    } else {
      zones.push({ low: p.price, high: p.price, touches: 1, last: p.i });
    }
  }
  const price = ctx.c[i];
  return zones
    .map(z => {
      const pad = 0.15 * a;
      const low = z.low - pad, high = z.high + pad;
      const mid = (low + high) / 2;
      const recency = 1 - Math.min(1, (i - z.last) / LOOKBACK);
      return { low, high, mid, touches: z.touches, strength: z.touches + recency, type: mid < price ? 'support' : 'resistance' };
    })
    .filter(z => z.touches >= 2 || Math.abs(z.mid - price) < 4 * a);
}

export function nearestZones(ctx, i) {
  const zones = srZones(ctx, i);
  const price = ctx.c[i];
  const sup = zones.filter(z => z.high < price || (z.low <= price && price <= z.high && z.mid < price))
    .sort((a, b) => b.mid - a.mid);
  const res = zones.filter(z => z.low > price || (z.low <= price && price <= z.high && z.mid >= price))
    .sort((a, b) => a.mid - b.mid);
  return { support: sup, resistance: res, all: zones };
}

// Classic floor-trader pivots from the previous completed UTC day.
export function dailyPivots(ctx, i) {
  const dayOf = (ms) => Math.floor(ms / 86400000);
  const today = dayOf(ctx.t[i]);
  let end = i;
  while (end >= 0 && dayOf(ctx.t[end]) === today) end--;
  if (end < 0) return null;
  const prevDay = dayOf(ctx.t[end]);
  let H = -Infinity, L = Infinity;
  for (let j = end; j >= 0 && dayOf(ctx.t[j]) === prevDay; j--) {
    H = Math.max(H, ctx.h[j]); L = Math.min(L, ctx.l[j]);
  }
  const C = ctx.c[end];
  const P = (H + L + C) / 3;
  return { P, R1: 2 * P - L, S1: 2 * P - H, R2: P + (H - L), S2: P - (H - L), R3: H + 2 * (P - L), S3: L - 2 * (H - P) };
}

// For daily (or higher) candles the previous bar *is* the previous day.
export function pivotsFor(ctx, i) {
  if (ctx.barMs >= 86400000) {
    if (i < 1) return null;
    const H = ctx.h[i - 1], L = ctx.l[i - 1], C = ctx.c[i - 1];
    const P = (H + L + C) / 3;
    return { P, R1: 2 * P - L, S1: 2 * P - H, R2: P + (H - L), S2: P - (H - L), R3: H + 2 * (P - L), S3: L - 2 * (H - P) };
  }
  return dailyPivots(ctx, i);
}

// Fibonacci retracement of the dominant swing in the last `n` bars.
export function fibonacci(ctx, i, n = 120) {
  const from = Math.max(0, i - n);
  let hi = -Infinity, lo = Infinity, hiI = -1, loI = -1;
  for (let j = from; j <= i; j++) {
    if (ctx.h[j] > hi) { hi = ctx.h[j]; hiI = j; }
    if (ctx.l[j] < lo) { lo = ctx.l[j]; loI = j; }
  }
  if (hiI < 0 || loI < 0 || hi === lo) return null;
  const up = loI < hiI; // impulse went up (low first, then high)
  const range = hi - lo;
  const lvl = (r) => (up ? hi - r * range : lo + r * range);
  return {
    up, hi, lo,
    levels: { '0.236': lvl(0.236), '0.382': lvl(0.382), '0.5': lvl(0.5), '0.618': lvl(0.618), '0.786': lvl(0.786) },
    goldenLow: Math.min(lvl(0.5), lvl(0.618)), goldenHigh: Math.max(lvl(0.5), lvl(0.618)),
  };
}

// Market structure from confirmed swings: HH/HL = bullish, LH/LL = bearish.
// BOS = close beyond the last swing in trend direction, CHoCH = against it.
export function structure(ctx, i) {
  const { highs, lows } = activeSwings(ctx, i, 200);
  if (highs.length < 2 || lows.length < 2) return { trend: 0, event: null };
  const [h1, h2] = highs.slice(-2), [l1, l2] = lows.slice(-2);
  let trend = 0;
  if (h2.price > h1.price && l2.price > l1.price) trend = 1;
  else if (h2.price < h1.price && l2.price < l1.price) trend = -1;
  const c = ctx.c[i];
  let event = null;
  if (c > h2.price) event = trend === -1 ? { type: 'CHoCH', dir: 1 } : { type: 'BOS', dir: 1 };
  else if (c < l2.price) event = trend === 1 ? { type: 'CHoCH', dir: -1 } : { type: 'BOS', dir: -1 };
  return { trend, event, lastHigh: h2.price, lastLow: l2.price };
}

// Order blocks: last opposite candle before an impulsive move (> 1.5 ATR in 3 bars)
// that breaks the prior 20-bar extreme. Valid until price closes through it.
export function orderBlocks(ctx, i, lookback = 150) {
  const out = [];
  const from = Math.max(25, i - lookback);
  for (let j = from; j < i - 3; j++) {
    const a = ctx.atr[j];
    if (!a) continue;
    const bear = ctx.c[j] < ctx.o[j], bull = ctx.c[j] > ctx.o[j];
    const move = ctx.c[j + 3] - ctx.c[j];
    let prevHi = -Infinity, prevLo = Infinity;
    for (let k = j - 20; k < j; k++) { prevHi = Math.max(prevHi, ctx.h[k]); prevLo = Math.min(prevLo, ctx.l[k]); }
    if (bear && move > 1.5 * a && Math.max(ctx.h[j + 1], ctx.h[j + 2], ctx.h[j + 3]) > prevHi) {
      out.push({ dir: 1, low: ctx.l[j], high: Math.max(ctx.o[j], ctx.c[j]), i: j });
    } else if (bull && -move > 1.5 * a && Math.min(ctx.l[j + 1], ctx.l[j + 2], ctx.l[j + 3]) < prevLo) {
      out.push({ dir: -1, low: Math.min(ctx.o[j], ctx.c[j]), high: ctx.h[j], i: j });
    }
  }
  return out.filter(ob => {
    for (let k = ob.i + 4; k <= i; k++) {
      if (ob.dir === 1 && ctx.c[k] < ob.low) return false;
      if (ob.dir === -1 && ctx.c[k] > ob.high) return false;
    }
    return true;
  }).slice(-6);
}

// Fair value gaps (3-candle imbalance) that have not been filled yet.
export function fairValueGaps(ctx, i, lookback = 100) {
  const out = [];
  const from = Math.max(2, i - lookback);
  for (let j = from; j <= i; j++) {
    const a = ctx.atr[j] || 0;
    if (ctx.l[j] > ctx.h[j - 2] && ctx.l[j] - ctx.h[j - 2] > 0.2 * a) out.push({ dir: 1, low: ctx.h[j - 2], high: ctx.l[j], i: j });
    if (ctx.h[j] < ctx.l[j - 2] && ctx.l[j - 2] - ctx.h[j] > 0.2 * a) out.push({ dir: -1, low: ctx.h[j], high: ctx.l[j - 2], i: j });
  }
  return out.filter(g => {
    for (let k = g.i + 1; k <= i; k++) {
      if (g.dir === 1 && ctx.l[k] <= g.low) return false;
      if (g.dir === -1 && ctx.h[k] >= g.high) return false;
    }
    return true;
  }).slice(-6);
}
