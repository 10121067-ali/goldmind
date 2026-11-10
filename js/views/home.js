import { t, L } from '../i18n.js';
import { store } from '../store.js';
import { INSTRUMENTS, BY_ID, STYLES } from '../config.js';
import { run, recompute, friendlyError } from '../service.js';
import { getLive, onLive } from '../data.js';
import { homeBrief, md } from '../ai.js';
import { tickerTape } from '../tv.js';
import { esc, fp, num, ago, dirClass, dirWord, errorText, skeleton } from '../ui.js';

let results = {};
let cleanup = [];

export function styleSeg(onChange) {
  const cur = store.get('style');
  const el = document.createElement('div');
  el.className = 'seg';
  el.innerHTML = Object.entries(STYLES).map(([k, s]) =>
    `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${L(s.label)}<small>${s.tfLabel}</small></button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    store.set({ style: b.dataset.k });
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onChange(b.dataset.k);
  };
  return el;
}

export function render(root) {
  cleanup.forEach(fn => fn()); cleanup = [];
  results = {};
  const ids = store.get('enabled');
  root.innerHTML = `
    <div class="ticker" id="ticker"></div>
    <div id="seg"></div>
    <div class="card ai mt" id="ai"></div>
    <div class="grid" id="cards">${ids.map(id => `<div class="card mk" id="mk-${id}" data-id="${id}"></div>`).join('')}</div>
    <p class="warn">${esc(t('disclaimer'))}</p>`;
  tickerTape(root.querySelector('#ticker'), ids);
  root.querySelector('#seg').appendChild(styleSeg(() => render(root)));
  root.querySelector('#cards').onclick = (e) => {
    const c = e.target.closest('.mk'); if (c) location.hash = '#analysis/' + c.dataset.id;
  };
  const style = store.get('style');
  ids.forEach(id => paintCard(id, null));
  renderAI(root, style, false);

  const order = ['XAU', 'XAG', 'DXY', 'XPT', 'XPD', 'HG', 'WTI'].filter(id => ids.includes(id));
  let pending = order.length;
  order.forEach(async (id) => {
    try {
      results[id] = await run(id, style);
      paintCard(id, results[id]);
    } catch (e) {
      paintCard(id, { error: friendlyError(e) });
    } finally {
      if (--pending === 0) renderAI(root, style, false);
    }
  });

  const off = onLive((id) => {
    if (!results[id] || results[id].error) { flashPrice(id); return; }
    const r = recompute(id, style);
    if (r) { results[id] = r; paintCard(id, r); } else flashPrice(id);
  });
  const timer = setInterval(() => order.forEach(async (id) => {
    try { const r = await run(id, style); results[id] = r; paintCard(id, r); } catch { /* keep last */ }
  }), 60000);
  cleanup.push(off, () => clearInterval(timer));
}

function priceHtml(id, r) {
  const lv = getLive(id);
  const p = lv?.price ?? r?.res?.price;
  const dayOpen = r?.ctx ? findDayOpen(r.ctx) : null;
  const ch = dayOpen && p ? ((p - dayOpen) / dayOpen) * 100 : null;
  const cls = ch == null ? '' : ch >= 0 ? 'up' : 'down';
  return `<div class="p num">${p ? fp(p, id) : '—'}</div>
    <div class="ch ${cls}">${ch == null ? '' : num((ch >= 0 ? '+' : '') + ch.toFixed(2) + '%')} ${lv ? `<span class="row" style="display:inline-flex;gap:4px"><i class="dot"></i>${t('live')}</span>` : ''}</div>`;
}

function findDayOpen(ctx) {
  const day = Math.floor(ctx.t[ctx.n - 1] / 864e5);
  for (let j = ctx.n - 1; j >= 0; j--) if (Math.floor(ctx.t[j] / 864e5) !== day) return ctx.c[j];
  return null;
}

function flashPrice(id) {
  const el = document.querySelector(`#mk-${id} .mk-price`);
  if (!el) return;
  const lv = getLive(id);
  el.innerHTML = priceHtml(id, results[id]);
  if (lv?.prev != null && lv.prev !== lv.price) {
    const p = el.querySelector('.p');
    p.classList.add(lv.price > lv.prev ? 'flash-up' : 'flash-down');
  }
}

function paintCard(id, r) {
  const el = document.getElementById('mk-' + id);
  if (!el) return;
  const inst = BY_ID[id];
  const head = `<div class="mk-head">
      <div class="mk-ic">${inst.icon}</div>
      <div><div class="mk-name">${esc(L(inst.name))}</div><div class="mk-sym">${inst.short} · ${STYLES[store.get('style')].tfLabel}</div></div>
      <div class="mk-price">${priceHtml(id, r)}</div></div>`;
  if (!r) { el.className = 'card mk'; el.innerHTML = head + skeleton(3); return; }
  if (r.error) { el.className = 'card mk'; el.innerHTML = head + `<p class="err">${errorText(r.error)}</p>`; return; }
  const { res } = r;
  const d = res.dir, p = res.plan;
  el.className = 'card mk ' + dirClass(d);
  const verdict = window.__aiVerdicts?.[id];
  const aiBadge = verdict ? `<span class="badge ${(verdict === 'BUY' && d > 0) || (verdict === 'SELL' && d < 0) || (verdict === 'WAIT' && d === 0) ? 'ai-agree' : 'ai-dis'}">AI: ${verdict === 'BUY' ? t('buy') : verdict === 'SELL' ? t('sell') : t('wait')}</span>` : '';
  const signal = `<div class="signal">
      <span class="pill ${dirClass(d)}">${dirWord(d)}${res.strength === 'strong' ? `<span class="st">${t('strong')}</span>` : ''}</span>
      <div class="conf"><div class="lbl"><span>${t('confidence')}</span><span class="num">${res.confidence}%</span></div>
      <div class="bar"><i style="width:${res.confidence}%"></i></div></div></div>`;
  let body;
  if (p) {
    body = `<div class="plan">
      <div class="e"><span class="k">${t('entry')}</span><span class="v num">${fp(p.entry, id)}</span>
        ${p.limit ? `<span class="k">${t('limitEntry')}: <b class="num">${fp(p.limit, id)}</b></span>` : ''}</div>
      <div class="sl"><div class="k">${t('sl')}</div><div class="v num">${fp(p.sl, id)}</div></div>
      <div class="tp"><div class="k">${t('tp1')}</div><div class="v num">${fp(p.tp1, id)}</div></div>
      <div class="tp"><div class="k">${t('tp2')}</div><div class="v num">${fp(p.tp2, id)}</div></div>
      <div class="tp" style="grid-column:span 3"><div class="k">${t('tp3')} · ${t('rr')}: <span class="num">1:${((Math.abs(p.tp3 - p.entry)) / p.risk).toFixed(1)}</span></div><div class="v num">${fp(p.tp3, id)}</div></div>
    </div>`;
  } else {
    const z = r.zones;
    body = `<div class="wait-box">${esc(L(res.note) || t('noSignalWhy'))}
      ${z.support[0] ? `<div class="mt small">🟢 ${t('buyZones')}: <b class="num">${fp(z.support[0].low, id)} – ${fp(z.support[0].high, id)}</b></div>` : ''}
      ${z.resistance[0] ? `<div class="small">🔴 ${t('sellZones')}: <b class="num">${fp(z.resistance[0].low, id)} – ${fp(z.resistance[0].high, id)}</b></div>` : ''}</div>`;
  }
  const reasons = `<div class="reasons">${res.top.slice(0, 3).map(v => `<span>${esc(L(v.why))}</span>`).join('')}</div>`;
  const bt = res.backtest;
  const foot = `<div class="mk-foot">
      <span>📊 ${t('backtest')}: <b class="num">${bt.trades ? Math.round(bt.winRate * 100) + '%' : '—'}</b> · ${num(bt.trades)} ${t('trades')} · ${num((bt.avgR >= 0 ? '+' : '') + bt.avgR.toFixed(2) + 'R')}</span>
      <span>${aiBadge} ${t('candlesAge')}: ${ago(r.at)}${r.stale ? ' ⚠️' : ''}</span></div>`;
  el.innerHTML = head + signal + body + reasons + foot;
}

async function renderAI(root, style, force) {
  const box = root.querySelector('#ai');
  if (!box) return;
  const header = `<h3>✨ ${t('aiSummary')}<span class="sp"></span><button class="btn small" id="ai-go">${t('refresh')}</button></h3>`;
  if (!store.get('geminiKey')) { box.innerHTML = header + `<p class="muted small">${t('aiNeedKey')} <a href="#settings">⚙️</a></p>`; return; }
  const ready = Object.keys(results).length;
  if (!force && ready === 0) { box.innerHTML = header + skeleton(4); bind(); return; }
  box.innerHTML = header + skeleton(4);
  bind();
  try {
    const clean = Object.fromEntries(Object.entries(results).filter(([, r]) => !r.error).map(([id, r]) => [id, r.res]));
    if (!Object.keys(clean).length) { box.innerHTML = header + `<p class="muted small">${t('loading')}</p>`; bind(); return; }
    const out = await homeBrief(clean, style, { force });
    window.__aiVerdicts = out.verdicts;
    Object.keys(results).forEach(id => paintCard(id, results[id]));
    box.innerHTML = header + `<div class="ai-body">${md(out.text)}</div>` +
      (out.sources?.length ? `<div class="sources">${out.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join('')}</div>` : '') +
      `<div class="small muted mt">${esc(out.model || '')}</div>`;
  } catch (e) {
    box.innerHTML = header + `<p class="err">${t('aiError')}: ${esc(e.message)}</p>`;
  }
  bind();
  function bind() { const b = box.querySelector('#ai-go'); if (b) b.onclick = () => renderAI(root, style, true); }
}

export function destroy() { cleanup.forEach(fn => fn()); cleanup = []; }
