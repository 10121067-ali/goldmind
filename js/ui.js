import { t, lang } from './i18n.js';
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

export function skeleton(lines = 3) {
  return Array.from({ length: lines }, (_, i) => `<div class="skel" style="width:${90 - i * 15}%"></div>`).join('');
}
