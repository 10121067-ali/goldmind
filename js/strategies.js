// Each strategy votes in [-1, 1] at bar i (+ = buy, - = sell, 0 = no opinion)
// and explains why, in Arabic and English. Categories let the engine adapt the
// weights to the market regime (trend vs range).
import { nearestZones, pivotsFor, fibonacci, structure, orderBlocks, fairValueGaps } from './levels.js';

const ok = (...xs) => xs.every(x => typeof x === 'number' && !Number.isNaN(x));
const clamp = (x) => Math.max(-1, Math.min(1, x));
const R = (v, ar, en) => ({ v: clamp(v), why: { ar, en } });
const N = (ar = 'لا إشارة واضحة', en = 'No clear signal') => R(0, ar, en);

export const STRATEGIES = [
  {
    id: 'ema_trend', cat: 'trend', w: 1.4,
    name: { ar: 'اتجاه المتوسطات 50/200', en: 'EMA 50/200 Trend' },
    desc: {
      ar: 'السعر فوق المتوسط 200 والمتوسط 50 فوق الـ 200 = اتجاه صاعد (نشتري بس). والعكس = هابط. هيدي أساس التداول مع الاتجاه.',
      en: 'Price above EMA200 with EMA50 above EMA200 = uptrend (buy only). The reverse = downtrend. The foundation of trend trading.',
    },
    run(x, i) {
      const c = x.c[i], e50 = x.ema50[i], e200 = x.ema200[i];
      if (!ok(e50, e200)) return N();
      if (c > e200 && e50 > e200) return R(1, 'السعر فوق EMA200 و EMA50 فوقها: اتجاه صاعد', 'Price > EMA200 and EMA50 > EMA200: uptrend');
      if (c < e200 && e50 < e200) return R(-1, 'السعر تحت EMA200 و EMA50 تحتها: اتجاه هابط', 'Price < EMA200 and EMA50 < EMA200: downtrend');
      return R(c > e200 ? 0.3 : -0.3, 'المتوسطات متضاربة: اتجاه ضعيف', 'Mixed averages: weak trend');
    },
  },
  {
    id: 'ema_cross', cat: 'trend', w: 1.0,
    name: { ar: 'تقاطع EMA 9/21', en: 'EMA 9/21 Crossover' },
    desc: {
      ar: 'المتوسط السريع 9 بيقطع البطيء 21 لفوق = زخم شراء، ولتحت = زخم بيع. التقاطع الجديد أقوى.',
      en: 'Fast EMA9 crossing above slow EMA21 = buying momentum; below = selling. Fresh crosses are stronger.',
    },
    run(x, i) {
      const a = x.ema9, b = x.ema21;
      if (!ok(a[i], b[i], a[i - 3], b[i - 3])) return N();
      const now = Math.sign(a[i] - b[i]);
      let fresh = false;
      for (let k = 1; k <= 3; k++) if (Math.sign(a[i - k] - b[i - k]) !== now) fresh = true;
      const v = now * (fresh ? 1 : 0.6);
      return now > 0
        ? R(v, fresh ? 'تقاطع صاعد جديد 9 فوق 21' : 'EMA9 فوق EMA21', fresh ? 'Fresh bullish cross 9 > 21' : 'EMA9 above EMA21')
        : R(v, fresh ? 'تقاطع هابط جديد 9 تحت 21' : 'EMA9 تحت EMA21', fresh ? 'Fresh bearish cross 9 < 21' : 'EMA9 below EMA21');
    },
  },
  {
    id: 'macd', cat: 'momentum', w: 1.0,
    name: { ar: 'MACD', en: 'MACD' },
    desc: {
      ar: 'خط MACD فوق خط الإشارة والهيستوغرام عم يكبر = زخم صاعد. والعكس = زخم هابط.',
      en: 'MACD above its signal line with a rising histogram = bullish momentum; the reverse = bearish.',
    },
    run(x, i) {
      const { line, signal, hist } = x.macd;
      if (!ok(line[i], signal[i], hist[i - 1])) return N();
      const above = line[i] > signal[i], rising = hist[i] > hist[i - 1];
      if (above && rising) return R(1, 'MACD فوق الإشارة والزخم عم يزيد', 'MACD above signal, momentum rising');
      if (!above && !rising) return R(-1, 'MACD تحت الإشارة والزخم عم ينزل', 'MACD below signal, momentum falling');
      return R(above ? 0.3 : -0.3, 'MACD عم يضعف', 'MACD momentum fading');
    },
  },
  {
    id: 'rsi', cat: 'reversion', w: 0.9,
    name: { ar: 'RSI تشبّع', en: 'RSI Overbought/Oversold' },
    desc: {
      ar: 'تحت 30 = تشبّع بيعي (فرصة شراء إذا بلّش يطلع). فوق 70 = تشبّع شرائي (فرصة بيع إذا بلّش ينزل). بين 40 و60 ما في إشارة.',
      en: 'Below 30 = oversold (buy when it turns up). Above 70 = overbought (sell when it turns down). 40–60 = neutral.',
    },
    run(x, i) {
      const r = x.rsi[i], p = x.rsi[i - 1];
      if (!ok(r, p)) return N();
      const t = r.toFixed(0);
      if (r < 30) return R(r > p ? 1 : 0.5, `RSI ${t}: تشبّع بيعي${r > p ? ' وعم يرتد' : ''}`, `RSI ${t}: oversold${r > p ? ', turning up' : ''}`);
      if (r > 70) return R(r < p ? -1 : -0.5, `RSI ${t}: تشبّع شرائي${r < p ? ' وعم ينزل' : ''}`, `RSI ${t}: overbought${r < p ? ', turning down' : ''}`);
      if (r > 55) return R(0.3, `RSI ${t}: زخم إيجابي`, `RSI ${t}: positive momentum`);
      if (r < 45) return R(-0.3, `RSI ${t}: زخم سلبي`, `RSI ${t}: negative momentum`);
      return N(`RSI ${t}: حيادي`, `RSI ${t}: neutral`);
    },
  },
  {
    id: 'rsi_div', cat: 'reversion', w: 1.1,
    name: { ar: 'دايفرجنس RSI', en: 'RSI Divergence' },
    desc: {
      ar: 'السعر عمل قاع أوطى بس الـ RSI عمل قاع أعلى = ضعف بالبيع (انعكاس صاعد محتمل). والعكس عند القمم = انعكاس هابط محتمل.',
      en: 'Price makes a lower low while RSI makes a higher low = selling exhaustion (bullish reversal). The mirror at highs = bearish reversal.',
    },
    run(x, i) {
      const lows = x.sw.lows.filter(p => p.confirm <= i && p.i > i - 60).slice(-2);
      const highs = x.sw.highs.filter(p => p.confirm <= i && p.i > i - 60).slice(-2);
      if (lows.length === 2 && i - lows[1].i < 15) {
        const [a, b] = lows;
        if (b.price < a.price && x.rsi[b.i] > x.rsi[a.i] + 2) return R(1, 'دايفرجنس صاعد: قاع أوطى بالسعر وأعلى بالـ RSI', 'Bullish divergence: lower price low, higher RSI low');
      }
      if (highs.length === 2 && i - highs[1].i < 15) {
        const [a, b] = highs;
        if (b.price > a.price && x.rsi[b.i] < x.rsi[a.i] - 2) return R(-1, 'دايفرجنس هابط: قمة أعلى بالسعر وأوطى بالـ RSI', 'Bearish divergence: higher price high, lower RSI high');
      }
      return N('ما في دايفرجنس', 'No divergence');
    },
  },
  {
    id: 'bollinger', cat: 'reversion', w: 0.9,
    name: { ar: 'بولينجر باند', en: 'Bollinger Bands' },
    desc: {
      ar: 'السعر طلع برّا الحد التحتاني ورجع لجوّا = ارتداد صاعد. وبرّا الفوقاني ورجع = ارتداد هابط. والـ squeeze (ضيق الباند) بيسبق حركة قوية.',
      en: 'Close back inside after piercing the lower band = bullish bounce; the upper band = bearish. A squeeze (narrow bands) precedes a strong move.',
    },
    run(x, i) {
      const { upper, lower, width } = x.bb;
      if (!ok(upper[i], lower[i], upper[i - 1])) return N();
      const c = x.c[i], pc = x.c[i - 1];
      if (pc < lower[i - 1] && c > lower[i]) return R(1, 'رجع لجوّا الباند من تحت: ارتداد صاعد', 'Re-entered from below the lower band: bullish bounce');
      if (pc > upper[i - 1] && c < upper[i]) return R(-1, 'رجع لجوّا الباند من فوق: ارتداد هابط', 'Re-entered from above the upper band: bearish bounce');
      let minW = Infinity;
      for (let k = i - 100; k < i; k++) if (ok(width[k])) minW = Math.min(minW, width[k]);
      const squeeze = width[i - 1] <= minW * 1.1;
      if (squeeze && c > upper[i]) return R(1, 'كسر squeeze لفوق', 'Squeeze breakout up');
      if (squeeze && c < lower[i]) return R(-1, 'كسر squeeze لتحت', 'Squeeze breakout down');
      if (c < lower[i]) return R(0.4, 'السعر تحت الباند: ممتد لتحت', 'Below lower band: stretched down');
      if (c > upper[i]) return R(-0.4, 'السعر فوق الباند: ممتد لفوق', 'Above upper band: stretched up');
      return N('السعر جوّا الباند', 'Inside the bands');
    },
  },
  {
    id: 'stoch', cat: 'reversion', w: 0.8,
    name: { ar: 'ستوكاستك', en: 'Stochastic' },
    desc: {
      ar: 'تقاطع %K فوق %D تحت الـ 20 = شراء. وتقاطع تحت فوق الـ 80 = بيع. ممتاز بالسوق العرضي.',
      en: '%K crossing above %D below 20 = buy; crossing below above 80 = sell. Best in ranging markets.',
    },
    run(x, i) {
      const { k, d } = x.stoch;
      if (!ok(k[i], d[i], k[i - 1], d[i - 1])) return N();
      const up = k[i - 1] <= d[i - 1] && k[i] > d[i], dn = k[i - 1] >= d[i - 1] && k[i] < d[i];
      if (up && k[i] < 25) return R(1, `تقاطع صاعد بمنطقة التشبّع البيعي (${k[i].toFixed(0)})`, `Bullish cross in oversold (${k[i].toFixed(0)})`);
      if (dn && k[i] > 75) return R(-1, `تقاطع هابط بمنطقة التشبّع الشرائي (${k[i].toFixed(0)})`, `Bearish cross in overbought (${k[i].toFixed(0)})`);
      if (k[i] < 20) return R(0.4, 'ستوكاستك بالتشبّع البيعي', 'Stochastic oversold');
      if (k[i] > 80) return R(-0.4, 'ستوكاستك بالتشبّع الشرائي', 'Stochastic overbought');
      return N();
    },
  },
  {
    id: 'ichimoku', cat: 'trend', w: 1.2,
    name: { ar: 'إيشيموكو', en: 'Ichimoku Cloud' },
    desc: {
      ar: 'السعر فوق الغيمة والتنكن فوق الكيجن = صاعد قوي. تحت الغيمة والتنكن تحت الكيجن = هابط قوي. جوّا الغيمة = ما في اتجاه.',
      en: 'Price above the cloud with Tenkan > Kijun = strong bullish; below with Tenkan < Kijun = strong bearish; inside = no trend.',
    },
    run(x, i) {
      const { tenkan, kijun, spanA, spanB } = x.ichi;
      if (!ok(tenkan[i], kijun[i], spanA[i], spanB[i])) return N();
      const c = x.c[i], top = Math.max(spanA[i], spanB[i]), bot = Math.min(spanA[i], spanB[i]);
      if (c > top) return R(tenkan[i] > kijun[i] ? 1 : 0.5, 'السعر فوق الغيمة', 'Price above the cloud');
      if (c < bot) return R(tenkan[i] < kijun[i] ? -1 : -0.5, 'السعر تحت الغيمة', 'Price below the cloud');
      return N('السعر جوّا الغيمة: ما في اتجاه', 'Inside the cloud: no trend');
    },
  },
  {
    id: 'supertrend', cat: 'trend', w: 1.2,
    name: { ar: 'سوبرترند', en: 'Supertrend' },
    desc: {
      ar: 'مؤشر اتجاه مبني على الـ ATR. أخضر = شراء، أحمر = بيع. ولمّا يقلب لون بتكون إشارة جديدة.',
      en: 'ATR-based trend indicator: green = buy, red = sell. A colour flip is a fresh signal.',
    },
    run(x, i) {
      const d = x.st.dir;
      if (!ok(d[i], d[i - 1])) return N();
      const flip = d[i] !== d[i - 1];
      return d[i] > 0
        ? R(1, flip ? 'سوبرترند قلب صاعد هلّق' : 'سوبرترند صاعد', flip ? 'Supertrend just flipped up' : 'Supertrend up')
        : R(-1, flip ? 'سوبرترند قلب هابط هلّق' : 'سوبرترند هابط', flip ? 'Supertrend just flipped down' : 'Supertrend down');
    },
  },
  {
    id: 'adx', cat: 'trend', w: 1.0,
    name: { ar: 'ADX / DMI', en: 'ADX / DMI' },
    desc: {
      ar: 'الـ ADX بيقيس قوّة الاتجاه (فوق 25 = قوي). و +DI فوق -DI = الشاريين أقوى، والعكس = البيّاعين أقوى.',
      en: 'ADX measures trend strength (>25 = strong). +DI above -DI = buyers in control; the reverse = sellers.',
    },
    run(x, i) {
      const { adx: a, pdi, ndi } = x.adx;
      if (!ok(a[i], pdi[i], ndi[i])) return N();
      if (a[i] < 20) return N(`ADX ${a[i].toFixed(0)}: سوق بلا اتجاه`, `ADX ${a[i].toFixed(0)}: no trend`);
      const s = Math.sign(pdi[i] - ndi[i]) * Math.min(1, a[i] / 35);
      return s > 0
        ? R(s, `ADX ${a[i].toFixed(0)} و +DI أقوى: الشاريين مسيطرين`, `ADX ${a[i].toFixed(0)}, +DI leads: buyers in control`)
        : R(s, `ADX ${a[i].toFixed(0)} و -DI أقوى: البيّاعين مسيطرين`, `ADX ${a[i].toFixed(0)}, -DI leads: sellers in control`);
    },
  },
  {
    id: 'psar', cat: 'trend', w: 0.7,
    name: { ar: 'بارابوليك SAR', en: 'Parabolic SAR' },
    desc: {
      ar: 'النقاط تحت السعر = صاعد، وفوقو = هابط. بيُستعمل كمان لتحريك وقف الخسارة.',
      en: 'Dots below price = uptrend, above = downtrend. Also used as a trailing stop.',
    },
    run(x, i) {
      const d = x.psar.dir[i];
      if (!ok(d)) return N();
      return d > 0 ? R(1, 'SAR تحت السعر', 'SAR below price') : R(-1, 'SAR فوق السعر', 'SAR above price');
    },
  },
  {
    id: 'donchian', cat: 'breakout', w: 1.0,
    name: { ar: 'اختراق دونشيان (Turtle)', en: 'Donchian Breakout (Turtle)' },
    desc: {
      ar: 'استراتيجية السلاحف المشهورة: إغلاق فوق أعلى سعر بآخر 20 شمعة = اختراق شراء. وتحت أوطى سعر = اختراق بيع.',
      en: 'The classic Turtle strategy: close above the 20-bar high = buy breakout; below the 20-bar low = sell breakout.',
    },
    run(x, i) {
      const { upper, lower } = x.don;
      if (!ok(upper[i], lower[i])) return N();
      if (x.c[i] > upper[i]) return R(1, 'اختراق أعلى قمة 20 شمعة', 'Broke the 20-bar high');
      if (x.c[i] < lower[i]) return R(-1, 'كسر أوطى قاع 20 شمعة', 'Broke the 20-bar low');
      return N('جوّا قناة دونشيان', 'Inside the Donchian channel');
    },
  },
  {
    id: 'sr', cat: 'structure', w: 1.3,
    name: { ar: 'دعم ومقاومة', en: 'Support & Resistance' },
    desc: {
      ar: 'مناطق السعر يلي ارتدّ منها كذا مرّة. قريب من دعم مع شمعة إيجابية = شراء. قريب من مقاومة مع شمعة سلبية = بيع.',
      en: 'Price zones that rejected price several times. Near support with a bullish candle = buy; near resistance with a bearish candle = sell.',
    },
    run(x, i) {
      const a = x.atr[i];
      if (!ok(a)) return N();
      const { support, resistance } = nearestZones(x, i);
      const c = x.c[i], bull = c > x.o[i], bear = c < x.o[i];
      const s = support[0], r = resistance[0];
      if (s && c - s.high < 0.6 * a && bull) return R(Math.min(1, 0.5 + s.touches * 0.15), `ارتداد من دعم (${s.touches} لمسات)`, `Bounce from support (${s.touches} touches)`);
      if (r && r.low - c < 0.6 * a && bear) return R(-Math.min(1, 0.5 + r.touches * 0.15), `رفض من مقاومة (${r.touches} لمسات)`, `Rejected at resistance (${r.touches} touches)`);
      if (s && c - s.high < 0.6 * a) return R(0.3, 'السعر عند دعم', 'Price at support');
      if (r && r.low - c < 0.6 * a) return R(-0.3, 'السعر عند مقاومة', 'Price at resistance');
      return N('السعر بالنص بين الدعم والمقاومة', 'Price between zones');
    },
  },
  {
    id: 'pivots', cat: 'structure', w: 0.8,
    name: { ar: 'نقاط البيفوت اليومية', en: 'Daily Pivot Points' },
    desc: {
      ar: 'مستويات بيحسبها كل المتداولين من أعلى وأوطى وإغلاق مبارح. فوق الـ P = ميل شراء، وتحت = ميل بيع. و S1/R1 مناطق ارتداد.',
      en: "Levels every trader computes from yesterday's high/low/close. Above P = bullish bias, below = bearish. S1/R1 are reaction levels.",
    },
    run(x, i) {
      const p = pivotsFor(x, i), a = x.atr[i];
      if (!p || !ok(a)) return N();
      const c = x.c[i];
      if (Math.abs(c - p.S1) < 0.4 * a && c > x.o[i]) return R(0.8, 'ارتداد من S1', 'Bounce from S1');
      if (Math.abs(c - p.R1) < 0.4 * a && c < x.o[i]) return R(-0.8, 'رفض من R1', 'Rejection at R1');
      return c > p.P ? R(0.4, 'السعر فوق البيفوت', 'Above the pivot') : R(-0.4, 'السعر تحت البيفوت', 'Below the pivot');
    },
  },
  {
    id: 'fib', cat: 'structure', w: 1.0,
    name: { ar: 'فيبوناتشي (المنطقة الذهبية)', en: 'Fibonacci Golden Zone' },
    desc: {
      ar: 'بعد موجة صاعدة، الرجوع لمنطقة 50%–61.8% هو أشهر مكان للشراء. وبعد موجة هابطة، نفس المنطقة للبيع.',
      en: 'After an up-leg, a pullback into the 50%–61.8% retracement is the classic buy zone; after a down-leg it is the sell zone.',
    },
    run(x, i) {
      const f = fibonacci(x, i);
      if (!f) return N();
      const c = x.c[i];
      if (c >= f.goldenLow && c <= f.goldenHigh) {
        return f.up
          ? R(c > x.o[i] ? 1 : 0.6, 'تصحيح للمنطقة الذهبية بعد موجة صاعدة', 'Pullback into golden zone after an up-leg')
          : R(c < x.o[i] ? -1 : -0.6, 'تصحيح للمنطقة الذهبية بعد موجة هابطة', 'Pullback into golden zone after a down-leg');
      }
      return N('السعر مش بالمنطقة الذهبية', 'Not in the golden zone');
    },
  },
  {
    id: 'smc', cat: 'structure', w: 1.3,
    name: { ar: 'بنية السوق (SMC)', en: 'Market Structure (SMC)' },
    desc: {
      ar: 'قمم وقيعان أعلى = صاعد، وأوطى = هابط. الـ BOS هو كسر مع الاتجاه (استمرار). والـ CHoCH هو كسر عكس الاتجاه (أول إشارة انعكاس).',
      en: 'Higher highs/lows = bullish, lower = bearish. BOS = break with the trend (continuation); CHoCH = break against it (first reversal sign).',
    },
    run(x, i) {
      const s = structure(x, i);
      if (s.event) {
        const ar = s.event.type === 'BOS' ? 'كسر بنية مع الاتجاه (BOS)' : 'تغيّر بالشخصية (CHoCH): انعكاس محتمل';
        const en = s.event.type === 'BOS' ? 'Break of structure (BOS)' : 'Change of character (CHoCH): possible reversal';
        return R(s.event.dir * (s.event.type === 'BOS' ? 1 : 0.8), `${ar} ${s.event.dir > 0 ? '↑' : '↓'}`, `${en} ${s.event.dir > 0 ? '↑' : '↓'}`);
      }
      if (s.trend > 0) return R(0.7, 'قمم وقيعان أعلى: بنية صاعدة', 'Higher highs & lows: bullish structure');
      if (s.trend < 0) return R(-0.7, 'قمم وقيعان أوطى: بنية هابطة', 'Lower highs & lows: bearish structure');
      return N('بنية متداخلة', 'Mixed structure');
    },
  },
  {
    id: 'ob_fvg', cat: 'structure', w: 1.1,
    name: { ar: 'Order Blocks و FVG', en: 'Order Blocks & FVG' },
    desc: {
      ar: 'مناطق دخلت فيها البنوك بقوّة (Order Block) أو تركت فراغ سعري (FVG). لمّا السعر يرجعلها، غالباً بيرتد بنفس اتجاه الحركة الأصلية.',
      en: 'Zones where institutions entered aggressively (order blocks) or left an imbalance (FVG). Price often reacts in the original direction on return.',
    },
    run(x, i) {
      const c = x.c[i];
      const inside = (z) => c >= z.low && c <= z.high;
      const ob = orderBlocks(x, i).filter(inside).pop();
      if (ob) return R(ob.dir, ob.dir > 0 ? 'السعر جوّا Order Block شرائي' : 'السعر جوّا Order Block بيعي', ob.dir > 0 ? 'Inside a bullish order block' : 'Inside a bearish order block');
      const g = fairValueGaps(x, i).filter(inside).pop();
      if (g) return R(g.dir * 0.7, g.dir > 0 ? 'السعر عم يعبّي FVG شرائي' : 'السعر عم يعبّي FVG بيعي', g.dir > 0 ? 'Filling a bullish FVG' : 'Filling a bearish FVG');
      return N('ما في OB أو FVG عند السعر', 'No OB/FVG at price');
    },
  },
  {
    id: 'candles', cat: 'pattern', w: 0.8,
    name: { ar: 'نماذج الشموع', en: 'Candlestick Patterns' },
    desc: {
      ar: 'الابتلاع الشرائي والمطرقة (Pin bar) = رفض للنزول. والابتلاع البيعي والشهاب = رفض للطلوع. بتكون أقوى عند دعم أو مقاومة.',
      en: 'Bullish engulfing and hammer = rejection of lower prices; bearish engulfing and shooting star = rejection of higher prices. Strongest at S/R.',
    },
    run(x, i) {
      const o = x.o[i], c = x.c[i], h = x.h[i], l = x.l[i], po = x.o[i - 1], pc = x.c[i - 1];
      const body = Math.abs(c - o), range = h - l || 1e-9;
      const upW = h - Math.max(o, c), loW = Math.min(o, c) - l;
      if (pc < po && c > o && c >= po && o <= pc) return R(1, 'ابتلاع شرائي', 'Bullish engulfing');
      if (pc > po && c < o && c <= po && o >= pc) return R(-1, 'ابتلاع بيعي', 'Bearish engulfing');
      if (loW > 2 * body && upW < body && body / range < 0.35) return R(0.8, 'مطرقة (Pin bar شرائي)', 'Hammer (bullish pin bar)');
      if (upW > 2 * body && loW < body && body / range < 0.35) return R(-0.8, 'شهاب (Pin bar بيعي)', 'Shooting star (bearish pin bar)');
      return N('ما في نموذج شموع', 'No candle pattern');
    },
  },
  {
    id: 'cci', cat: 'reversion', w: 0.7,
    name: { ar: 'CCI', en: 'CCI' },
    desc: {
      ar: 'رجوع الـ CCI فوق -100 = نهاية بيع قوي (شراء). ورجوعو تحت +100 = نهاية شراء قوي (بيع).',
      en: 'CCI crossing back above -100 = end of a sell-off (buy); back below +100 = end of a rally (sell).',
    },
    run(x, i) {
      const v = x.cci[i], p = x.cci[i - 1];
      if (!ok(v, p)) return N();
      if (p < -100 && v > -100) return R(1, 'CCI رجع فوق -100', 'CCI back above -100');
      if (p > 100 && v < 100) return R(-1, 'CCI رجع تحت +100', 'CCI back below +100');
      return N();
    },
  },
];

export const STRATEGY_INDEX = Object.fromEntries(STRATEGIES.map(s => [s.id, s]));
