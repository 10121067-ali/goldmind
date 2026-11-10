const KEY = 'gm.settings.v1';

const DEFAULTS = {
  lang: 'ar',
  style: 'day',
  tdKey: '',
  groqKey: '',
  geminiKey: '',
  geminiModel: '',
  enabled: ['XAU', 'XAG', 'XPT', 'XPD', 'HG', 'WTI', 'DXY'],
  tdPerMinute: 8,
  tdPerDay: 800,
  liveEveryMs: 5000,
};

let settings = { ...DEFAULTS, ...safeParse(localStorage.getItem(KEY)) };
const listeners = new Set();

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

export const store = {
  get: (k) => settings[k],
  all: () => ({ ...settings }),
  set(patch) {
    settings = { ...settings, ...patch };
    localStorage.setItem(KEY, JSON.stringify(settings));
    listeners.forEach(fn => fn(patch));
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// Small JSON cache in localStorage with timestamps.
export const cache = {
  get(k) { const v = safeParse(localStorage.getItem('gm.c.' + k)); return v && v.at ? v : null; },
  set(k, data) {
    try { localStorage.setItem('gm.c.' + k, JSON.stringify({ at: Date.now(), data })); }
    catch { cache.prune(); }
  },
  prune() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('gm.c.'));
    keys.map(k => [k, safeParse(localStorage.getItem(k)).at || 0]).sort((a, b) => a[1] - b[1])
      .slice(0, Math.ceil(keys.length / 2)).forEach(([k]) => localStorage.removeItem(k));
  },
};
