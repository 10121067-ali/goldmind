import { BY_ID, STYLES, BAR_MS } from './config.js';
import { store } from './store.js';
import { getCandles, withLive } from './data.js';
import { buildContext, analyze, backtest, zonesReport, WARMUP } from './engine.js';

const memo = new Map();   // key -> { ltf, htf, dxy, sources... }
const btMemo = new Map(); // key -> backtest result for a given candle snapshot

async function load(id, style, force) {
  const st = STYLES[style];
  const inst = BY_ID[id];
  const ltfP = getCandles(id, st.ltf, { size: 1000, force });
  const htfP = getCandles(id, st.htf, { size: 400, force }).catch(() => null);
  const wantDxy = inst.metal && store.get('tdKey');
  const dxyP = wantDxy ? getCandles('DXY', st.htf, { size: 400 }).catch(() => null) : Promise.resolve(null);
  const [ltf, htf, dxy] = await Promise.all([ltfP, htfP, dxyP]);
  const entry = { ltf, htf, dxy };
  memo.set(id + '.' + style, entry);
  return entry;
}

function compute(id, style, entry) {
  const st = STYLES[style];
  const inst = BY_ID[id];
  const { candles, applied } = withLive(entry.ltf.candles, id, entry.ltf.source);
  if (candles.length < WARMUP + 20) throw new Error('not-enough-data');
  const ctx = buildContext(candles, BAR_MS[st.ltf]);
  const htfCtx = entry.htf && entry.htf.candles.length > WARMUP ? buildContext(entry.htf.candles, BAR_MS[st.htf]) : null;
  const dxyCtx = entry.dxy && entry.dxy.candles.length > WARMUP ? buildContext(entry.dxy.candles, BAR_MS[st.htf]) : null;
  const res = analyze(ctx, { htf: htfCtx, dxy: dxyCtx, isMetal: inst.metal, livePrice: candles[candles.length - 1].c });
  const btKey = `${id}.${style}.${entry.ltf.at}`;
  if (!btMemo.has(btKey)) btMemo.set(btKey, backtest(buildContext(entry.ltf.candles, BAR_MS[st.ltf])));
  res.backtest = btMemo.get(btKey);
  return {
    id, style, res, ctx, zones: zonesReport(ctx), liveApplied: applied,
    source: entry.ltf.source, at: entry.ltf.at, stale: !!entry.ltf.stale, error: entry.ltf.error,
  };
}

// Full refresh (fetch if cache expired) + analysis.
export async function run(id, style, { force = false } = {}) {
  const entry = await load(id, style, force);
  return compute(id, style, entry);
}

// Cheap re-analysis on a new live price, using candles already in memory.
export function recompute(id, style) {
  const entry = memo.get(id + '.' + style);
  if (!entry) return null;
  try { return compute(id, style, entry); } catch { return null; }
}

export function friendlyError(e) {
  const m = (e && e.message) || String(e);
  if (m === 'need-key') return 'needKey';
  if (m === 'daily-limit' || /run out of API credits|credits/i.test(m)) return 'dailyLimit';
  if (/symbol|plan|not found|not available|upgrade/i.test(m)) return 'notAvailable';
  return m;
}
