// Forecast track record: keep the first day projection made for each window
// and grade it once the window has closed, using the candles we already have.
const KEY = 'gm.track.v1';
const MAX = 60;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (rows) => localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX)));

export function record(id, pj) {
  const rows = load();
  if (rows.some(r => r.id === id && r.end === pj.end)) return;
  rows.push({
    id, end: pj.end, t0: pj.t0, p0: pj.price, pUp: pj.pUpClose,
    lo: pj.close60[0], hi: pj.close60[1], eh: pj.expHigh, el: pj.expLow,
  });
  save(rows);
}

// Fill in the outcome of finished windows from the 15m context.
export function grade(id, ctx, barMs) {
  const rows = load();
  let changed = false;
  for (const r of rows) {
    if (r.id !== id || r.close != null || Date.now() < r.end + barMs) continue;
    let j = -1;
    for (let k = ctx.n - 1; k >= 0; k--) if (ctx.t[k] + barMs <= r.end) { j = k; break; }
    if (j < 0 || ctx.t[j] < r.t0) continue;
    let hi = -Infinity, lo = Infinity;
    for (let k = 0; k <= j; k++) if (ctx.t[k] >= r.t0) { hi = Math.max(hi, ctx.h[k]); lo = Math.min(lo, ctx.l[k]); }
    r.close = ctx.c[j]; r.hiAct = hi; r.loAct = lo;
    changed = true;
  }
  if (changed) save(rows);
}

export function stats(id) {
  const done = load().filter(r => r.id === id && r.close != null);
  const called = done.filter(r => Math.abs(r.pUp - 0.5) >= 0.03);
  const dirOk = called.filter(r => (r.close > r.p0) === (r.pUp > 0.5)).length;
  const inBand = done.filter(r => r.close >= r.lo && r.close <= r.hi).length;
  const rangeOk = done.filter(r => r.hiAct <= r.eh * 1.0005 && r.loAct >= r.el * 0.9995).length;
  return { n: done.length, called: called.length, dirOk, inBand, rangeOk, last: done.slice(-5).reverse() };
}
