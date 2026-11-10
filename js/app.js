import { t, applyDir } from './i18n.js';
import { startLive } from './data.js';
import * as home from './views/home.js';
import * as analysis from './views/analysis.js';
import * as strategies from './views/strategies.js';
import * as settings from './views/settings.js';

const view = document.getElementById('view');

function relabel() {
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
}

function route() {
  const [name, arg] = location.hash.replace(/^#/, '').split('/');
  home.destroy(); analysis.destroy(); strategies.destroy();
  document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (name || 'home')));
  window.scrollTo(0, 0);
  if (name === 'analysis') analysis.render(view, arg);
  else if (name === 'strategies') strategies.render(view, arg);
  else if (name === 'settings') settings.render(view);
  else home.render(view);
}

function netStatus() {
  const on = navigator.onLine;
  document.getElementById('net-dot').classList.toggle('off', !on);
  document.getElementById('net-txt').textContent = on ? t('live') : t('offline');
}

applyDir();
relabel();
window.addEventListener('gm:relabel', () => { relabel(); netStatus(); });
window.addEventListener('hashchange', route);
window.addEventListener('online', netStatus);
window.addEventListener('offline', netStatus);
netStatus();
startLive();
route();

// Remember the last instrument opened on pages 2 and 3.
document.querySelector('nav.tabs').addEventListener('click', (e) => {
  const a = e.target.closest('a'); if (!a) return;
  const cur = location.hash.split('/')[1];
  if (cur && (a.dataset.tab === 'analysis' || a.dataset.tab === 'strategies')) {
    e.preventDefault(); location.hash = `#${a.dataset.tab}/${cur}`;
  }
});

// PWA: service worker + install prompt.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}
let deferred = null;
const bar = document.getElementById('install');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferred = e;
  if (!matchMedia('(display-mode: standalone)').matches) bar.classList.add('show');
});
document.getElementById('install-go').onclick = async () => {
  bar.classList.remove('show');
  if (deferred) { deferred.prompt(); deferred = null; }
};
document.getElementById('install-x').onclick = () => bar.classList.remove('show');
