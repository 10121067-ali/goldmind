import { store } from './store.js';
import { onLive } from './data.js';
import { BY_ID } from './config.js';
import { L, t } from './i18n.js';
import { fp } from './ui.js';

// Price alerts while the app is open: when the live price crosses a pending
// order entry or a nearby support/resistance, ring, vibrate and notify.
const watch = new Map();  // id -> [{ key, label, price }]
const fired = new Map();  // id.key -> last fire time
const COOLDOWN = 30 * 6e4;

export function track(id, res, z = {}) {
  const items = [];
  (res.scenarios || []).forEach(s => items.push({
    key: s.type, price: s.entry, dir: s.dir,
    label: `${s.dir > 0 ? '🟢' : '🔴'} ${t('sc_' + s.type)}`,
  }));
  (z.support || []).slice(0, 1).forEach(s => items.push({ key: 'sup', price: (s.low + s.high) / 2, label: L({ ar: '🛡️ الدعم', en: '🛡️ Support' }) }));
  (z.resistance || []).slice(0, 1).forEach(s => items.push({ key: 'res', price: (s.low + s.high) / 2, label: L({ ar: '🧱 المقاومة', en: '🧱 Resistance' }) }));
  watch.set(id, items.filter(x => Number.isFinite(x.price)));
}

let audio = null;
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.25, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.15);
      o.connect(g).connect(audio.destination);
      o.start(now + d); o.stop(now + d + 0.16);
    });
  } catch { /* no audio */ }
}

function toast(html) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  el.onclick = () => el.remove();
  box.appendChild(el);
  setTimeout(() => el.remove(), 20000);
}

async function notify(title, body, id) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag: 'gm-' + id, renotify: true, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: `./#today/${id}` } };
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { /* ignore */ }
}

function fire(id, item, price) {
  const k = `${id}.${item.key}`;
  if (Date.now() - (fired.get(k) || 0) < COOLDOWN) return;
  fired.set(k, Date.now());
  const inst = BY_ID[id];
  const title = `${inst.icon} ${L(inst.name)}: ${item.label}`;
  const body = L({ ar: `السعر وصل ${fp(price, id)} (المستوى ${fp(item.price, id)})`, en: `Price hit ${fp(price, id)} (level ${fp(item.price, id)})` });
  beep();
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  toast(`<b>${title}</b><div class="small">${body}</div><a href="#today/${id}" class="small">${L({ ar: 'افتح التوقّع ←', en: 'Open outlook →' })}</a>`);
  notify(title, body, id);
}

export async function enableAlerts() {
  store.set({ alerts: true });
  beep();
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export function startAlerts() {
  onLive((id, q) => {
    if (!store.get('alerts') || q.prev == null) return;
    const a = Math.min(q.prev, q.price), b = Math.max(q.prev, q.price);
    if (a === b) return;
    (watch.get(id) || []).forEach(item => { if (item.price >= a && item.price <= b) fire(id, item, q.price); });
  });
}
