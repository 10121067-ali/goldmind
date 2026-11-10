import { t, L, lang } from './i18n.js';
import { BY_ID } from './config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fp = (x, id) => (x == null || Number.isNaN(x) ? '—' : Number(x).toLocaleString('en-US', {
  minimumFractionDigits: BY_ID[id]?.dp ?? 2, maximumFractionDigits: BY_ID[id]?.dp ?? 2,
}));
export const num = (s) => `<span class="num">${s}</span>`;

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  const v = s < 60 ? `${s}${t('sec')}` : `${Math.round(s / 60)}${t('min')}`;
  return lang() === 'ar' ? `${t('ago')} ${v}` : `${v} ${t('ago')}`;
}

export const dirClass = (d) => (d > 0 ? 'buy' : d < 0 ? 'sell' : 'wait');
export const dirWord = (d) => (d > 0 ? t('buy') : d < 0 ? t('sell') : t('wait'));

export function voteBar(v) {
  const w = Math.abs(v) * 50;
  const col = v > 0 ? 'var(--buy)' : v < 0 ? 'var(--sell)' : 'var(--wait)';
  const pos = v >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
  return `<div class="vbar"><i style="${pos};background:${col}"></i></div>`;
}

export function errorText(code) {
  return ['needKey', 'dailyLimit', 'notAvailable'].includes(code) ? t(code) : esc(code);
}

export function leanText(score) {
  if (score >= 8) return `<b class="up">${t('leanUp')}</b>`;
  if (score <= -8) return `<b class="down">${t('leanDown')}</b>`;
  return `<b class="muted">${t('leanFlat')}</b>`;
}

// Forecast rows: probability of being higher after each horizon (vs. the usual
// rate) and the 60% expected range. `only` limits to the longest horizon.
export function forecastHtml(res, id, { only = false } = {}) {
  const fc = res.forecast || [];
  const rows = only ? fc.slice(-1) : fc;
  if (!rows.length) return '';
  return `<div class="fc">${rows.map(f => {
    const up = Math.round(f.pUp * 100), base = Math.round(f.baseUp * 100);
    return `<div class="fc-row">
      <div class="fc-h">${t('within')} ${esc(L(f.label))}</div>
      <div class="fc-p"><span class="up ${up > 50 ? 'big' : ''}">▲ ${num(up + '%')}</span> <span class="down ${up < 50 ? 'big' : ''}">▼ ${num((100 - up) + '%')}</span>
        <span class="muted small">(${t('usually')} ${num(base + '%')})</span></div>
      <div class="fc-r small">${t('expRange')}: <b class="num">${fp(f.lo, id)} – ${fp(f.hi, id)}</b></div>
      <div class="fc-bar"><i class="dn" style="width:${100 - up}%"></i><i class="upb" style="width:${up}%"></i></div>
    </div>`;
  }).join('')}</div>`;
}

export function scenariosHtml(res, id, { max = 4 } = {}) {
  const sc = (res.scenarios || []).slice()
    .sort((a, b) => (b.likely - a.likely) || (a.type.endsWith('Limit') ? -1 : 1))
    .slice(0, max);
  if (!sc.length) return '';
  return `<div class="scn">${sc.map(s => `<div class="scn-row ${s.dir > 0 ? 's' : 'r'}">
      <div class="scn-t">${s.dir > 0 ? '🟢' : '🔴'} ${t('sc_' + s.type)}${s.likely ? ` <span class="badge likely">${t('likely')}</span>` : ''}</div>
      <div class="scn-v small"><span>${t('entry')} <b class="num">${fp(s.entry, id)}</b></span>
        <span>${t('sl')} <b class="num down">${fp(s.sl, id)}</b></span>
        <span>${t('tp1')} <b class="num up">${fp(s.tp1, id)}</b></span>
        <span>${t('tp2')} <b class="num up">${fp(s.tp2, id)}</b></span></div>
    </div>`).join('')}</div>`;
}

export function skeleton(lines = 3) {
  return Array.from({ length: lines }, (_, i) => `<div class="skel" style="width:${90 - i * 15}%"></div>`).join('');
}
