export const INSTRUMENTS = [
  { id: 'XAU', name: { ar: 'الذهب', en: 'Gold' }, short: 'XAU/USD', icon: '🥇', metal: true, dp: 2,
    td: ['XAU/USD'], tv: 'OANDA:XAUUSD', live: 'XAU', binance: 'PAXGUSDT', contract: 100 },
  { id: 'XAG', name: { ar: 'الفضة', en: 'Silver' }, short: 'XAG/USD', icon: '🥈', metal: true, dp: 3,
    td: ['XAG/USD'], tv: 'OANDA:XAGUSD', live: 'XAG', contract: 5000 },
  { id: 'XPT', name: { ar: 'البلاتين', en: 'Platinum' }, short: 'XPT/USD', icon: '⚪', metal: true, dp: 2,
    td: ['XPT/USD'], tv: 'OANDA:XPTUSD', live: 'XPT' },
  { id: 'XPD', name: { ar: 'البلاديوم', en: 'Palladium' }, short: 'XPD/USD', icon: '🔘', metal: true, dp: 2,
    td: ['XPD/USD'], tv: 'OANDA:XPDUSD', live: 'XPD' },
  { id: 'HG', name: { ar: 'النحاس', en: 'Copper' }, short: 'COPPER', icon: '🟠', metal: true, dp: 4,
    td: ['XCU/USD', 'HG1', 'COPPER'], tv: 'OANDA:XCUUSD', live: 'HG' },
  { id: 'WTI', name: { ar: 'النفط WTI', en: 'Crude Oil WTI' }, short: 'WTI', icon: '🛢️', metal: false, dp: 2,
    td: ['WTI/USD', 'CL1', 'USOIL'], tv: 'TVC:USOIL', contract: 1000 },
  { id: 'DXY', name: { ar: 'مؤشر الدولار', en: 'US Dollar Index' }, short: 'DXY', icon: '💵', metal: false, dp: 3,
    td: ['DXY', 'USDX', 'DX1'], tv: 'TVC:DXY' },
];
export const BY_ID = Object.fromEntries(INSTRUMENTS.map(x => [x.id, x]));

// Entry timeframe (ltf) and trend-filter timeframe (htf) for each trading style.
export const STYLES = {
  scalp: { ltf: '5min', htf: '1h', label: { ar: 'سكالبينغ', en: 'Scalping' }, tfLabel: '5m', tvInterval: '5',
    horizons: [{ bars: 6, label: { ar: 'نص ساعة', en: '30 min' } }, { bars: 12, label: { ar: 'ساعة', en: '1 hour' } }] },
  day: { ltf: '15min', htf: '4h', label: { ar: 'يومي', en: 'Day' }, tfLabel: '15m', tvInterval: '15',
    horizons: [{ bars: 4, label: { ar: 'ساعة', en: '1 hour' } }, { bars: 16, label: { ar: '4 ساعات', en: '4 hours' } }] },
  swing: { ltf: '4h', htf: '1day', label: { ar: 'سوينغ', en: 'Swing' }, tfLabel: '4H', tvInterval: '240',
    horizons: [{ bars: 6, label: { ar: 'يوم', en: '1 day' } }, { bars: 18, label: { ar: '3 أيام', en: '3 days' } }] },
};

export const BAR_MS = { '5min': 3e5, '15min': 9e5, '1h': 36e5, '4h': 144e5, '1day': 864e5 };
// How long fetched candles stay fresh before refetching (indicator refresh).
// The live price is applied on top in real time.
export const TTL_MS = { '5min': 4 * 6e4, '15min': 10 * 6e4, '1h': 20 * 6e4, '4h': 60 * 6e4, '1day': 240 * 6e4 };
export const BINANCE_TF = { '5min': '5m', '15min': '15m', '1h': '1h', '4h': '4h', '1day': '1d' };
