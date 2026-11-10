import { store, cache } from './store.js';
import { BY_ID, TTL_MS, BINANCE_TF } from './config.js';

// ---------- Twelve Data request budget (free plan: 8/min, 800/day) ----------
const usageKey = () => 'gm.td.usage.' + new Date().toISOString().slice(0, 10);
export const usage = {
  today: () => Number(localStorage.getItem(usageKey()) || 0),
  add: (n = 1) => localStorage.setItem(usageKey(), String(usage.today() + n)),
};
const recent = [];
const queue = [];
let pumping = false;

function tdSchedule(fn) {
  return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const now = Date.now();
    while (recent.length && now - recent[0] > 61000) recent.shift();
    if (recent.length >= store.get('tdPerMinute')) {
      await sleep(61000 - (now - recent[0]) + 50);
      continue;
    }
    if (usage.today() >= store.get('tdPerDay')) {
      const err = new Error('daily-limit');
      queue.splice(0).forEach(q => q.reject(err));
      break;
    }
    const job = queue.shift();
    recent.push(Date.now());
    usage.add();
    job.fn().then(job.resolve, job.reject);
  }
  pumping = false;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const queueLength = () => queue.length;

// ---------- Candles ----------
const pack = (cs) => cs.map(k => [k.t, k.o, k.h, k.l, k.c]);
const unpack = (rows) => rows.map(([t, o, h, l, c]) => ({ t, o, h, l, c }));

async function tdFetch(symbol, interval, size) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}` +
    `&outputsize=${size}&timezone=UTC&order=ASC&apikey=${encodeURIComponent(store.get('tdKey'))}`;
  const res = await fetch(url);
  const j = await res.json();
  if (j.status !== 'ok' || !Array.isArray(j.values)) {
    const e = new Error(j.message || 'Twelve Data error');
    e.code = j.code; throw e;
  }
  return j.values.map(v => ({
    t: Date.parse(v.datetime.replace(' ', 'T') + (v.datetime.length > 10 ? 'Z' : 'T00:00:00Z')),
    o: +v.open, h: +v.high, l: +v.low, c: +v.close,
  })).filter(k => Number.isFinite(k.c));
}

async function binanceFetch(symbol, interval, size) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${BINANCE_TF[interval]}&limit=${Math.min(size, 1000)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Binance ' + res.status);
  const rows = await res.json();
  return rows.map(r => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
}

const inflight = new Map();

// Returns { candles, source, at, stale } or throws.
export async function getCandles(id, interval, { size = 800, force = false } = {}) {
  const inst = BY_ID[id];
  const key = `k.${id}.${interval}`;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS[interval];
  if (hit && fresh && !force) return { candles: unpack(hit.data.rows), source: hit.data.source, at: hit.at };
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      let rows, source;
      if (store.get('tdKey')) {
        const remembered = localStorage.getItem('gm.sym.' + id);
        const aliases = remembered ? [remembered, ...inst.td.filter(s => s !== remembered)] : inst.td;
        let lastErr;
        for (const sym of aliases) {
          try {
            rows = await tdSchedule(() => tdFetch(sym, interval, size));
            localStorage.setItem('gm.sym.' + id, sym);
            source = 'Twelve Data · ' + sym;
            break;
          } catch (e) {
            lastErr = e;
            if (e.message === 'daily-limit' || e.code === 429 || e.code === 401) break;
          }
        }
        if (!rows && inst.binance) { rows = await binanceFetch(inst.binance, interval, size); source = 'Binance · PAXG'; }
        if (!rows) throw lastErr || new Error('no-data');
      } else if (inst.binance) {
        rows = await binanceFetch(inst.binance, interval, size);
        source = 'Binance · PAXG';
      } else {
        throw new Error('need-key');
      }
      cache.set(key, { rows: pack(rows), source });
      return { candles: rows, source, at: Date.now() };
    } catch (e) {
      if (hit) return { candles: unpack(hit.data.rows), source: hit.data.source, at: hit.at, stale: true, error: e.message };
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ---------- Live prices (gold-api.com: free, no key, real-time spot) ----------
const live = {};
const liveListeners = new Set();
export const onLive = (fn) => { liveListeners.add(fn); return () => liveListeners.delete(fn); };
export const getLive = (id) => live[id];

let liveTimer = null;
export function startLive() {
  if (liveTimer) return;
  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    const ids = store.get('enabled').filter(id => BY_ID[id].live);
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`https://api.gold-api.com/price/${BY_ID[id].live}`, { cache: 'no-store' });
        const j = await r.json();
        if (!Number.isFinite(j.price)) return;
        const prev = live[id];
        live[id] = { price: j.price, at: Date.parse(j.updatedAt) || Date.now(), prev: prev?.price };
        liveListeners.forEach(fn => fn(id, live[id]));
      } catch { /* network hiccup: keep last value */ }
    }));
  };
  tick();
  liveTimer = setInterval(tick, store.get('liveEveryMs'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
}

// Apply the live price to the last candle, unless the two feeds disagree by
// more than 2% (e.g. different units). The PAXG proxy trades at a small
// premium/discount to spot gold, so its candles are rescaled onto spot first.
export function withLive(candles, id, source) {
  const lp = live[id]?.price;
  if (!lp || !candles.length) return { candles, applied: false };
  let last = candles[candles.length - 1];
  if (Math.abs(lp - last.c) / last.c > 0.02) return { candles, applied: false };
  let copy = candles.slice();
  if ((source || '').includes('PAXG')) {
    const k = lp / last.c;
    copy = copy.map(c => ({ t: c.t, o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k }));
    last = copy[copy.length - 1];
  }
  copy[copy.length - 1] = { ...last, c: lp, h: Math.max(last.h, lp), l: Math.min(last.l, lp) };
  return { candles: copy, applied: true };
}
