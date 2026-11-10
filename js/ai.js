import { store, cache } from './store.js';
import { BY_ID, STYLES } from './config.js';
import { lang } from './i18n.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export async function listModels(key = store.get('geminiKey')) {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Gemini ' + r.status);
  return (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .filter(n => /gemini/.test(n) && !/(image|tts|audio|live|embedding|vision|thinking-exp|learnlm|robotics|computer)/.test(n));
}

// Prefer the newest "flash" (free tier friendly), stable over preview.
export function pickModel(names) {
  const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const rank = (n) => ver(n) * 100 + (/flash/.test(n) ? 20 : 0) - (/lite/.test(n) ? 8 : 0)
    - (/(preview|exp)/.test(n) ? 5 : 0) + (/latest/.test(n) ? 1 : 0);
  return [...names].sort((a, b) => rank(b) - rank(a))[0];
}

async function geminiModel(key) {
  let m = store.get('geminiModel');
  if (!m) { m = pickModel(await listModels(key)); store.set({ geminiModel: m }); }
  return m;
}

async function gemini(prompt, { key = store.get('geminiKey'), search = true, maxTokens = 4096 } = {}) {
  const m = await geminiModel(key);
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: maxTokens },
  };
  if (search) body.tools = [{ google_search: {} }];
  const r = await fetch(`${API}/models/${m}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) {
    if (search && r.status === 400) return gemini(prompt, { key, search: false, maxTokens });
    throw new Error(j.error?.message || 'Gemini ' + r.status);
  }
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('').trim();
  const sources = (cand?.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean)
    .map(w => ({ uri: w.uri, title: w.title })).slice(0, 8);
  if (!text) throw new Error('empty');
  return { text, sources, model: 'Gemini · ' + m };
}

// Groq (free plan, no card). gpt-oss models browse the web server-side via the
// built-in browser_search tool; on rate/size limits fall back to the smaller
// model, then to no search.
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRIES = [
  { model: 'openai/gpt-oss-120b', search: true },
  { model: 'openai/gpt-oss-20b', search: true },
  { model: 'openai/gpt-oss-120b', search: false },
];

async function groqOnce(prompt, key, { model, search, maxTokens }) {
  const body = {
    model, messages: [{ role: 'user', content: prompt }],
    temperature: 0.4, max_completion_tokens: maxTokens, reasoning_effort: 'low',
  };
  if (search) body.tools = [{ type: 'browser_search' }];
  const r = await fetch(GROQ, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.message || 'Groq ' + r.status); e.status = r.status; throw e; }
  const msg = j.choices?.[0]?.message || {};
  const text = (msg.content || '').replace(/【[^】]*】/g, '').trim();
  if (!text) throw new Error('empty');
  const sources = [], seen = new Set();
  for (const tool of msg.executed_tools || []) {
    for (const s of tool.search_results?.results || []) {
      if (!s.url || seen.has(s.url) || /viewing lines/i.test(s.title || '')) continue;
      seen.add(s.url); sources.push({ uri: s.url, title: (s.title || s.url).replace(/\s+/g, ' ').trim() });
    }
  }
  return { text, sources: sources.slice(0, 8), model: 'Groq · ' + model.replace('openai/', '') + (search ? ' + web' : '') };
}

async function groq(prompt, { key = store.get('groqKey'), search = true, maxTokens = 3000 } = {}) {
  let last;
  for (const t of GROQ_TRIES.filter(x => search || !x.search)) {
    try { return await groqOnce(prompt, key, { ...t, maxTokens }); } catch (e) {
      last = e;
      if (e.status === 401 || e.status === 403) throw e;
    }
  }
  throw last;
}

export const hasAI = () => !!(store.get('groqKey') || store.get('geminiKey'));

// Groq first (free everywhere), Gemini as fallback, or the other way round if
// only one key is set.
export async function generate(prompt, opts = {}) {
  const providers = [];
  if (store.get('groqKey')) providers.push(groq);
  if (store.get('geminiKey')) providers.push(gemini);
  if (!providers.length) throw new Error('no-key');
  let last;
  for (const p of providers) {
    try { return await p(prompt, opts); } catch (e) { last = e; }
  }
  throw last;
}

// Real round-trip used by the settings "Test keys" button.
export async function testProvider(name, key) {
  const fn = name === 'groq' ? groq : gemini;
  const out = await fn('Reply with the single word: OK', { key, search: false, maxTokens: 1024 });
  return out.model;
}

const fmt = (x, dp) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(dp));
const dirWord = (d) => (d > 0 ? 'BUY' : d < 0 ? 'SELL' : 'WAIT');

export function engineLine(id, res) {
  const inst = BY_ID[id];
  if (!res) return `${id}: no data`;
  const p = res.plan, dp = inst.dp;
  const reasons = res.top.map(v => v.why.en).join('; ');
  return `${inst.name.en} (${id}) price ${fmt(res.price, dp)} | engine: ${dirWord(res.dir)}${res.strength === 'strong' ? ' (strong)' : ''}` +
    ` agreement ${res.confidence}% score ${res.score.toFixed(0)} regime ${res.regime.id}` +
    (p ? ` | entry ${fmt(p.entry, dp)} SL ${fmt(p.sl, dp)} TP1 ${fmt(p.tp1, dp)} TP2 ${fmt(p.tp2, dp)} TP3 ${fmt(p.tp3, dp)}` : '') +
    (res.backtest ? ` | backtest ${res.backtest.trades} trades, win ${(res.backtest.winRate * 100).toFixed(0)}%, avgR ${res.backtest.avgR.toFixed(2)}` : '') +
    (res.forecast?.length ? ` | empirical forecast: ${res.forecast.map(f => `next ${f.label.en} P(up) ${(f.pUp * 100).toFixed(0)}% (base ${(f.baseUp * 100).toFixed(0)}%), 60% range ${fmt(f.lo, dp)}-${fmt(f.hi, dp)}`).join('; ')}` : '') +
    (!p && res.scenarios?.length ? ` | pending plans: ${res.scenarios.map(s => `${s.type} ${fmt(s.entry, dp)} SL ${fmt(s.sl, dp)} TP1 ${fmt(s.tp1, dp)} TP2 ${fmt(s.tp2, dp)}`).join('; ')}` : '') +
    ` | reasons: ${reasons}`;
}

const langName = () => (lang() === 'ar' ? 'Lebanese/Levantine Arabic (simple, clear; keep technical terms like RSI, EMA in English)' : 'English');
const today = () => new Date().toUTCString();

export async function homeBrief(results, style, { force = false } = {}) {
  const ck = `ai.home.${style}.${lang()}`;
  const hit = cache.get(ck);
  if (hit && !force && Date.now() - hit.at < 60 * 6e4) return hit.data;
  const lines = Object.entries(results).map(([id, r]) => engineLine(id, r)).join('\n');
  const prompt = `You are a senior commodities trader and analyst. Current time: ${today()}.
Trading style: ${STYLES[style].label.en} (entry timeframe ${STYLES[style].tfLabel}).
Below is the live output of our quantitative engine (19 technical strategies, multi-timeframe filter, dollar-index filter, walk-forward backtest):
${lines}

Search the web to get TODAY's market-moving news for gold, silver, platinum, palladium, copper, oil and the US dollar (Fed, CPI/jobs data, yields, geopolitics, central-bank buying, China demand, OPEC).
Write in ${langName()}. Max 170 words. Use this exact structure with short bullet points:
### 🌍 
(market mood today + the 2-3 news items that matter most, each with its likely effect)
### 🎯 
(the best 1-2 opportunities, ONLY among the markets listed above. Only recommend a trade when the engine signal and the news agree; otherwise say wait. Quote the engine's entry/SL/targets exactly.)
### ⚠️ 
(upcoming risk events you actually found in a source, with time converted to UTC; skip events already released today, and say "time unconfirmed" if unsure)
Never invent prices, times or engine signals. Do not claim an engine signal for a market that is not listed above. Be direct and honest; no hype.
After the text, add one line per market in exactly this format (no extra text):
VERDICT XAU: BUY|SELL|WAIT
(one line for each of: ${Object.keys(results).join(', ')})`;
  const out = await generate(prompt);
  const verdicts = {};
  out.text = out.text.replace(/^VERDICT\s+([A-Z]+)\s*:\s*(BUY|SELL|WAIT).*$/gm, (_, id, v) => { verdicts[id] = v; return ''; }).trim();
  const data = { ...out, verdicts };
  cache.set(ck, data);
  return data;
}

export async function instrumentAnalysis(id, res, zones, style, { force = false } = {}) {
  const ck = `ai.inst.${id}.${style}.${lang()}`;
  const hit = cache.get(ck);
  if (hit && !force && Date.now() - hit.at < 120 * 6e4) return hit.data;
  const inst = BY_ID[id], dp = inst.dp;
  const z = zones ? [
    'Supports: ' + zones.support.map(s => `${fmt(s.low, dp)}-${fmt(s.high, dp)} (${s.touches} touches)`).join(', '),
    'Resistances: ' + zones.resistance.map(s => `${fmt(s.low, dp)}-${fmt(s.high, dp)} (${s.touches} touches)`).join(', '),
    zones.pivots ? `Daily pivots: P ${fmt(zones.pivots.P, dp)} S1 ${fmt(zones.pivots.S1, dp)} R1 ${fmt(zones.pivots.R1, dp)} S2 ${fmt(zones.pivots.S2, dp)} R2 ${fmt(zones.pivots.R2, dp)}` : '',
    zones.fib ? `Fibonacci golden zone ${fmt(zones.fib.goldenLow, dp)}-${fmt(zones.fib.goldenHigh, dp)} (${zones.fib.up ? 'after up-leg' : 'after down-leg'})` : '',
    `Order blocks: ${zones.ob.map(o => `${o.dir > 0 ? 'bull' : 'bear'} ${fmt(o.low, dp)}-${fmt(o.high, dp)}`).join(', ') || 'none'}`,
    `FVG: ${zones.fvg.map(o => `${o.dir > 0 ? 'bull' : 'bear'} ${fmt(o.low, dp)}-${fmt(o.high, dp)}`).join(', ') || 'none'}`,
  ].filter(Boolean).join('\n') : '';
  const prompt = `You are a senior ${inst.name.en} trader. Current time: ${today()}. Style: ${STYLES[style].label.en} (${STYLES[style].tfLabel}).
Engine output: ${engineLine(id, res)}
Key levels from price action:
${z}

Search the web for the latest news and fundamentals affecting ${inst.name.en} today and this week.
Write in ${langName()}, max 300 words, with these sections:
### 📰 
(latest news & fundamentals with dates, and their likely impact)
### 📊 
(technical picture using the engine data and the levels above)
### 🟢 / 🔴 
(bullish scenario and bearish scenario with exact trigger levels from the list above)
### 🎯 
(trade plan: agree with the engine signal, or explain clearly why to wait. Use the engine's entry/SL/targets.)
### 📅 
(upcoming events this week that can move ${inst.short}, only ones you found in a source, times in UTC or "time unconfirmed")
Never invent prices, times or engine signals. No hype; be honest about uncertainty.`;
  const out = await generate(prompt);
  cache.set(ck, out);
  return out;
}

// Minimal, safe markdown -> HTML (escape first).
export function md(text) {
  const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lines = esc(text).split(/\r?\n/);
  let html = '', inList = false;
  for (let raw of lines) {
    const line = raw.trim();
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S.+?)\*(?=\s|$)/g, '$1<i>$2</i>');
    if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^([-*•]|\d+[.)])\s+/, ''))}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!line) continue;
    const h = line.match(/^#{1,4}\s*(.*)$/);
    html += h ? `<h4>${inline(h[1])}</h4>` : `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
