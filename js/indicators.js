// Technical indicators. Every function takes arrays and returns a full-length
// series aligned with the input (NaN where not yet defined), so strategies can
// be evaluated at any bar index without recomputation (needed for backtesting).

export function sma(src, n) {
  const out = new Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= n) sum -= src[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(src, n) {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (n + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (i === n - 1) {
      let s = 0;
      for (let j = 0; j < n; j++) s += src[j];
      prev = s / n;
    } else if (i >= n) {
      prev = src[i] * k + prev * (1 - k);
    }
    out[i] = i >= n - 1 ? prev : NaN;
  }
  return out;
}

// Wilder smoothing (RMA)
export function rma(src, n) {
  const out = new Array(src.length).fill(NaN);
  let prev = NaN, s = 0, cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (Number.isNaN(v)) continue;
    if (cnt < n) {
      s += v; cnt++;
      if (cnt === n) { prev = s / n; out[i] = prev; }
    } else {
      prev = (prev * (n - 1) + v) / n;
      out[i] = prev;
    }
  }
  return out;
}

export function stdev(src, n) {
  const m = sma(src, n);
  const out = new Array(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (src[j] - m[i]) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}

export function trueRange(h, l, c) {
  return h.map((_, i) => i === 0 ? h[0] - l[0]
    : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
}

export function atr(h, l, c, n = 14) { return rma(trueRange(h, l, c), n); }

export function rsi(c, n = 14) {
  const up = c.map((v, i) => i === 0 ? 0 : Math.max(v - c[i - 1], 0));
  const dn = c.map((v, i) => i === 0 ? 0 : Math.max(c[i - 1] - v, 0));
  const au = rma(up.slice(1), n), ad = rma(dn.slice(1), n);
  const out = [NaN];
  for (let i = 0; i < au.length; i++) {
    out.push(Number.isNaN(au[i]) ? NaN : ad[i] === 0 ? 100 : 100 - 100 / (1 + au[i] / ad[i]));
  }
  return out;
}

export function macd(c, f = 12, s = 26, sig = 9) {
  const ef = ema(c, f), es = ema(c, s);
  const line = c.map((_, i) => ef[i] - es[i]);
  const firstValid = line.findIndex(v => !Number.isNaN(v));
  const sigPart = ema(line.slice(firstValid), sig);
  const signal = new Array(firstValid).fill(NaN).concat(sigPart);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

export function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n), sd = stdev(c, n);
  return {
    mid,
    upper: mid.map((m, i) => m + k * sd[i]),
    lower: mid.map((m, i) => m - k * sd[i]),
    width: mid.map((m, i) => (2 * k * sd[i]) / m),
  };
}

export function stochastic(h, l, c, kN = 14, kS = 3, dN = 3) {
  const raw = c.map((v, i) => {
    if (i < kN - 1) return NaN;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kN + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
    return hh === ll ? 50 : (100 * (v - ll)) / (hh - ll);
  });
  const k = smaSkipNaN(raw, kS);
  const d = smaSkipNaN(k, dN);
  return { k, d };
}

function smaSkipNaN(src, n) {
  const first = src.findIndex(v => !Number.isNaN(v));
  if (first < 0) return src.map(() => NaN);
  return new Array(first).fill(NaN).concat(sma(src.slice(first), n));
}

export function adx(h, l, c, n = 14) {
  const pdm = h.map((v, i) => {
    if (i === 0) return 0;
    const u = v - h[i - 1], d = l[i - 1] - l[i];
    return u > d && u > 0 ? u : 0;
  });
  const ndm = l.map((v, i) => {
    if (i === 0) return 0;
    const u = h[i] - h[i - 1], d = l[i - 1] - v;
    return d > u && d > 0 ? d : 0;
  });
  const tr = rma(trueRange(h, l, c), n);
  const p = rma(pdm, n), m = rma(ndm, n);
  const pdi = p.map((v, i) => (100 * v) / tr[i]);
  const ndi = m.map((v, i) => (100 * v) / tr[i]);
  const dx = pdi.map((v, i) => (v + ndi[i] === 0 ? 0 : (100 * Math.abs(v - ndi[i])) / (v + ndi[i])));
  return { adx: rma(dx, n), pdi, ndi };
}

export function supertrend(h, l, c, n = 10, mult = 3) {
  const a = atr(h, l, c, n);
  const dir = new Array(c.length).fill(NaN);
  const line = new Array(c.length).fill(NaN);
  let fu = NaN, fl = NaN, d = 1;
  for (let i = 0; i < c.length; i++) {
    if (Number.isNaN(a[i])) continue;
    const hl2 = (h[i] + l[i]) / 2;
    const bu = hl2 + mult * a[i], bl = hl2 - mult * a[i];
    fu = Number.isNaN(fu) || bu < fu || c[i - 1] > fu ? bu : fu;
    fl = Number.isNaN(fl) || bl > fl || c[i - 1] < fl ? bl : fl;
    if (d === 1 && c[i] < fl) d = -1;
    else if (d === -1 && c[i] > fu) d = 1;
    dir[i] = d;
    line[i] = d === 1 ? fl : fu;
  }
  return { dir, line };
}

export function ichimoku(h, l, t = 9, k = 26, s = 52) {
  const mid = (n) => h.map((_, i) => {
    if (i < n - 1) return NaN;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
    return (hh + ll) / 2;
  });
  const tenkan = mid(t), kijun = mid(k), senkouBRaw = mid(s);
  const len = h.length;
  // Span A/B are plotted k bars ahead: the cloud *at* bar i uses values from i-k.
  const spanA = new Array(len).fill(NaN), spanB = new Array(len).fill(NaN);
  for (let i = k; i < len; i++) {
    spanA[i] = (tenkan[i - k] + kijun[i - k]) / 2;
    spanB[i] = senkouBRaw[i - k];
  }
  return { tenkan, kijun, spanA, spanB };
}

export function psar(h, l, step = 0.02, max = 0.2) {
  const out = new Array(h.length).fill(NaN);
  const dir = new Array(h.length).fill(NaN);
  if (h.length < 3) return { sar: out, dir };
  let up = h[1] > h[0], af = step;
  let ep = up ? h[1] : l[1];
  let sar = up ? l[0] : h[0];
  for (let i = 2; i < h.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, l[i - 1], l[i - 2]);
      if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = step; }
      else if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, max); }
    } else {
      sar = Math.max(sar, h[i - 1], h[i - 2]);
      if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = step; }
      else if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, max); }
    }
    out[i] = sar; dir[i] = up ? 1 : -1;
  }
  return { sar: out, dir };
}

export function donchian(h, l, n = 20) {
  const upper = h.map((_, i) => {
    if (i < n) return NaN;
    let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, h[j]); return m;
  });
  const lower = l.map((_, i) => {
    if (i < n) return NaN;
    let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, l[j]); return m;
  });
  return { upper, lower };
}

export function cci(h, l, c, n = 20) {
  const tp = c.map((v, i) => (h[i] + l[i] + v) / 3);
  const m = sma(tp, n);
  return tp.map((v, i) => {
    if (i < n - 1) return NaN;
    let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]);
    md /= n;
    return md === 0 ? 0 : (v - m[i]) / (0.015 * md);
  });
}

export function williamsR(h, l, c, n = 14) {
  return c.map((v, i) => {
    if (i < n - 1) return NaN;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
    return hh === ll ? -50 : (-100 * (hh - v)) / (hh - ll);
  });
}

export function keltner(h, l, c, n = 20, mult = 1.5) {
  const mid = ema(c, n), a = atr(h, l, c, n);
  return { mid, upper: mid.map((m, i) => m + mult * a[i]), lower: mid.map((m, i) => m - mult * a[i]) };
}

// Swing pivots: a high/low is confirmed only `right` bars later, so at bar i we
// may only use pivots with confirmIndex <= i (no look-ahead in backtests).
export function swings(h, l, left = 3, right = 3) {
  const highs = [], lows = [];
  for (let i = left; i < h.length - right; i++) {
    let isH = true, isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (h[j] >= h[i]) isH = false;
      if (l[j] <= l[i]) isL = false;
    }
    if (isH) highs.push({ i, price: h[i], confirm: i + right });
    if (isL) lows.push({ i, price: l[i], confirm: i + right });
  }
  return { highs, lows };
}
