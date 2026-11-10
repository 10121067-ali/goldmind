import { t, L } from '../i18n.js';
import { store } from '../store.js';
import { INSTRUMENTS, BY_ID, STYLES } from '../config.js';
import { run, recompute, friendlyError } from '../service.js';
import { onLive } from '../data.js';
import { instrumentAnalysis, md } from '../ai.js';
import { advancedChart, technicalGauge, newsTimeline, econCalendar } from '../tv.js';
import { esc, fp, num, dirClass, dirWord, errorText, skeleton, leanText, forecastHtml, scenariosHtml } from '../ui.js';
import { styleSeg } from './home.js';

export function instrumentChips(cur, base) {
  return `<div class="chips">${store.get('enabled').map(id =>
    `<a class="chip ${id === cur ? 'on' : ''}" href="${base}/${id}" style="text-decoration:none;color:inherit">${BY_ID[id].icon} ${esc(L(BY_ID[id].name))}</a>`).join('')}</div>`;
}

let offLive = null;
let gen = 0;
export function destroy() { gen++; if (offLive) offLive(); offLive = null; }

export function render(root, id) {
  destroy();
  const my = gen;
  id = BY_ID[id] ? id : (store.get('enabled')[0] || 'XAU');
  const inst = BY_ID[id];
  const style = store.get('style');
  const st = STYLES[style];
  root.innerHTML = `
    ${instrumentChips(id, '#analysis')}
    <div id="seg"></div>
    <div class="card mt"><h3>📈 ${t('chart')} · ${esc(L(inst.name))}</h3><div class="tv-box" id="chart"></div></div>
    <div class="card" id="sum">${skeleton(2)}</div>
    <div class="card" id="fc"><h3>🔮 ${t('forecast')}</h3>${skeleton(3)}</div>
    <div class="card" id="zones"><h3>🎯 ${t('zones')}</h3>${skeleton(4)}</div>
    <div class="card ai" id="ai"></div>
    <div class="card"><h3>🧭 ${t('tvTech')}</h3><div class="tv-box mid" id="gauge"></div></div>
    <div class="card"><h3>📰 ${t('news')}</h3><div class="tv-box tall" id="news"></div></div>
    <div class="card"><h3>📅 ${t('calendar')}</h3><div class="tv-box tall" id="cal"></div></div>
    <p class="warn">${esc(t('disclaimer'))}</p>`;
  root.querySelector('#seg').appendChild(styleSeg(() => render(root, id)));
  advancedChart(root.querySelector('#chart'), inst.tv, st.tvInterval);
  technicalGauge(root.querySelector('#gauge'), inst.tv, st.tvInterval);
  newsTimeline(root.querySelector('#news'), inst.tv);
  econCalendar(root.querySelector('#cal'));

  run(id, style).then((r) => {
    if (my !== gen) return;
    paintSummary(root, id, r);
    paintZones(root, id, r);
    paintAI(root, id, r, style, false);
    offLive = onLive((lid) => {
      if (lid !== id) return;
      const nr = recompute(id, style);
      if (nr) { paintSummary(root, id, nr); paintZones(root, id, nr); }
    });
  }).catch((e) => {
    if (my !== gen) return;
    const msg = `<p class="err">${errorText(friendlyError(e))}</p>`;
    root.querySelector('#sum').innerHTML = msg;
    root.querySelector('#zones').innerHTML = `<h3>🎯 ${t('zones')}</h3>` + msg;
    root.querySelector('#fc').innerHTML = `<h3>🔮 ${t('forecast')}</h3>` + msg;
    paintAI(root, id, null, style, false);
  });
}

function paintSummary(root, id, r) {
  const { res } = r;
  const p = res.plan;
  root.querySelector('#sum').innerHTML = `
    <div class="row between">
      <span class="pill ${dirClass(res.dir)}">${dirWord(res.dir)}${res.strength === 'strong' ? `<span class="st">${t('strong')}</span>` : ''}</span>
      <span class="small muted">${t('confidence')}: <b class="num">${res.confidence}%</b> · ${t('regime_' + res.regime.id)}</span>
    </div>
    ${p ? `<div class="plan mt">
      <div class="e"><span class="k">${t('entry')}</span><span class="v num">${fp(p.entry, id)}</span>${p.limit ? `<span class="k">${t('limitEntry')}: <b class="num">${fp(p.limit, id)}</b></span>` : ''}</div>
      <div class="sl"><div class="k">${t('sl')}</div><div class="v num">${fp(p.sl, id)}</div></div>
      <div class="tp"><div class="k">${t('tp1')}</div><div class="v num">${fp(p.tp1, id)}</div></div>
      <div class="tp"><div class="k">${t('tp2')}</div><div class="v num">${fp(p.tp2, id)}</div></div>
    </div>` : `<div class="wait-box mt">${esc(L(res.note) || t('noSignalWhy'))}</div>`}
    <div class="row between mt small muted"><span>${t('source')}: ${esc(r.source)}</span><a href="#strategies/${id}">${t('allStrategies')} ←</a></div>`;
  root.querySelector('#fc').innerHTML = `<h3>🔮 ${t('forecast')}</h3>
    <div class="small">${t('lean')}: ${leanText(res.lean)}</div>
    ${forecastHtml(res, id)}
    <p class="small muted">${esc(t('forecastHow'))}</p>
    <div class="sub">📋 ${t('plans')}</div>
    ${scenariosHtml(res, id) || '<p class="muted small">—</p>'}
    <p class="small muted">${esc(t('plansHow'))}</p>`;
}

function paintZones(root, id, r) {
  const z = r.zones;
  const zl = (arr, cls) => arr.length ? arr.map(s => `<div class="zone ${cls}"><b class="num">${fp(s.low, id)} – ${fp(s.high, id)}</b><span class="tch">${s.touches} ${t('touches')}</span></div>`).join('') : '<p class="muted small">—</p>';
  const pv = z.pivots;
  const fib = z.fib;
  const s = z.structure;
  const sTxt = s.trend > 0 ? t('bullish') : s.trend < 0 ? t('bearish') : t('neutral');
  root.querySelector('#zones').innerHTML = `<h3>🎯 ${t('zones')}</h3>
    <div class="zones">
      <div><div class="small muted" style="margin-bottom:6px">🟢 ${t('buyZones')}</div>${zl(z.support, 's')}</div>
      <div><div class="small muted" style="margin-bottom:6px">🔴 ${t('sellZones')}</div>${zl(z.resistance, 'r')}</div>
    </div>
    ${z.ob.length || z.fvg.length ? `<div class="mt"><div class="small muted">${t('ob')} / ${t('fvg')}</div>
      ${z.ob.map(o => `<div class="zone ${o.dir > 0 ? 's' : 'r'}"><span>OB ${o.dir > 0 ? '🟢' : '🔴'}</span><b class="num">${fp(o.low, id)} – ${fp(o.high, id)}</b></div>`).join('')}
      ${z.fvg.map(o => `<div class="zone ${o.dir > 0 ? 's' : 'r'}"><span>FVG ${o.dir > 0 ? '🟢' : '🔴'}</span><b class="num">${fp(o.low, id)} – ${fp(o.high, id)}</b></div>`).join('')}
    </div>` : ''}
    <div class="grid mt">
      ${pv ? `<div><div class="small muted">${t('pivots')}</div><div class="kv mt">
        <b>R2</b><span class="num">${fp(pv.R2, id)}</span><b>R1</b><span class="num">${fp(pv.R1, id)}</span>
        <b>P</b><span class="num">${fp(pv.P, id)}</span><b>S1</b><span class="num">${fp(pv.S1, id)}</span><b>S2</b><span class="num">${fp(pv.S2, id)}</span></div></div>` : ''}
      ${fib ? `<div><div class="small muted">${t('fib')} (${fib.up ? '↑' : '↓'})</div><div class="kv mt">
        ${Object.entries(fib.levels).map(([k, v]) => `<b>${(+k * 100).toFixed(1)}%</b><span class="num">${fp(v, id)}</span>`).join('')}</div></div>` : ''}
    </div>
    <div class="mt small">${t('structure')}: <b>${sTxt}</b>${s.event ? ` · ${s.event.type} ${s.event.dir > 0 ? '↑' : '↓'}` : ''}</div>`;
}

async function paintAI(root, id, r, style, force) {
  const box = root.querySelector('#ai');
  if (!box) return;
  const header = `<h3>✨ ${t('aiAnalysis')}<span class="sp"></span><button class="btn small" id="ai-go">${t('aiRun')}</button></h3>`;
  const bind = () => { const b = box.querySelector('#ai-go'); if (b) b.onclick = () => paintAI(root, id, r, style, true); };
  if (!store.get('geminiKey')) { box.innerHTML = header + `<p class="muted small">${t('aiNeedKey')} <a href="#settings">⚙️</a></p>`; return; }
  if (!r) { box.innerHTML = header; bind(); return; }
  box.innerHTML = header + skeleton(6); bind();
  try {
    const out = await instrumentAnalysis(id, r.res, r.zones, style, { force });
    box.innerHTML = header + `<div class="ai-body">${md(out.text)}</div>` +
      (out.sources?.length ? `<div class="sources">${out.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join('')}</div>` : '') +
      `<div class="small muted mt">${esc(out.model || '')}</div>`;
  } catch (e) {
    box.innerHTML = header + `<p class="err">${t('aiError')}: ${esc(e.message)}</p>`;
  }
  bind();
}
