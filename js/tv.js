import { lang } from './i18n.js';
import { INSTRUMENTS } from './config.js';

const locale = () => (lang() === 'ar' ? 'ar_AE' : 'en');

// Mounts an official TradingView embed widget (real-time, free, no key).
export function mountTV(el, type, config) {
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tradingview-widget-container';
  wrap.style.height = '100%';
  wrap.style.width = '100%';
  const inner = document.createElement('div');
  inner.className = 'tradingview-widget-container__widget';
  inner.style.height = '100%';
  wrap.appendChild(inner);
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
  s.textContent = JSON.stringify({ colorTheme: 'dark', isTransparent: true, locale: locale(), ...config });
  wrap.appendChild(s);
  el.appendChild(wrap);
}

export function tickerTape(el, ids) {
  mountTV(el, 'ticker-tape', {
    symbols: INSTRUMENTS.filter(x => ids.includes(x.id)).map(x => ({ proName: x.tv, title: x.short })),
    showSymbolLogo: true, displayMode: 'compact',
  });
}

export function advancedChart(el, symbol, interval) {
  mountTV(el, 'advanced-chart', {
    symbol, interval, timezone: 'Etc/UTC', theme: 'dark', style: '1', autosize: true,
    allow_symbol_change: false, hide_side_toolbar: true, withdateranges: false,
    studies: ['STD;EMA', 'STD;RSI'], backgroundColor: 'rgba(11,14,20,1)', gridColor: 'rgba(255,255,255,0.04)',
    support_host: 'https://www.tradingview.com',
  });
}

export function technicalGauge(el, symbol, interval) {
  const map = { '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1D' };
  mountTV(el, 'technical-analysis', {
    symbol, interval: map[interval] || '1h', width: '100%', height: '100%',
    displayMode: 'single', showIntervalTabs: true,
  });
}

export function newsTimeline(el, symbol) {
  mountTV(el, 'timeline', { feedMode: 'symbol', symbol, displayMode: 'regular', width: '100%', height: '100%' });
}

export function econCalendar(el) {
  mountTV(el, 'events', {
    width: '100%', height: '100%', importanceFilter: '0,1', countryFilter: 'us,eu,gb,cn,jp,ch',
  });
}

export function miniQuote(el, symbol) {
  mountTV(el, 'single-quote', { symbol, width: '100%' });
}
