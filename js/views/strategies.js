import { t, L } from '../i18n.js';
import { store } from '../store.js';
import { BY_ID } from '../config.js';
import { run, recompute, friendlyError } from '../service.js';
import { onLive } from '../data.js';
import { STRATEGY_INDEX } from '../strategies.js';
import { esc, num, dirClass, dirWord, voteBar, errorText, skeleton } from '../ui.js';
import { styleSeg } from './home.js';
import { instrumentChips } from './analysis.js';

const EXTRA = {
  mtf: { name: { ar: 'فلتر الفريم الأكبر', en: 'Higher-timeframe filter' },
    desc: { ar: 'منشوف اتجاه الفريم الأكبر (مثلاً الساعة للسكالب، والـ 4 ساعات لليومي). إذا الإشارة عكسو بقوّة، المحرّك بيقلّك انتظر. هيدي من أهم قواعد المحترفين: تداول مع الاتجاه الكبير.', en: 'Checks the higher timeframe trend (1H for scalping, 4H for day trading). If the signal strongly opposes it, the engine says wait. A core professional rule: trade with the bigger trend.' } },
  dxy: { name: { ar: 'العلاقة مع الدولار (DXY)', en: 'Dollar correlation (DXY)' },
    desc: { ar: 'المعادن مسعّرة بالدولار، فلمّا الدولار يقوى بتنزل عادةً، ولمّا يضعف بتطلع. المحرّك بيقرا اتجاه DXY وبيعطيه صوت عكسي للمعادن.', en: 'Metals are priced in dollars: a stronger dollar usually pushes them down, a weaker one up. The engine reads the DXY trend and gives metals the inverse vote.' } },
};

let offLive = null;
let gen = 0;
export function destroy() { gen++; if (offLive) offLive(); offLive = null; }

export function render(root, id) {
  destroy();
  const my = gen;
  id = BY_ID[id] ? id : (store.get('enabled')[0] || 'XAU');
  const style = store.get('style');
  root.innerHTML = `
    ${instrumentChips(id, '#strategies')}
    <div id="seg"></div>
    <div id="body" class="mt"><div class="card">${skeleton(5)}</div></div>
    <p class="warn">${esc(t('disclaimer'))}</p>`;
  root.querySelector('#seg').appendChild(styleSeg(() => render(root, id)));
  run(id, style).then((r) => {
    if (my !== gen) return;
    paint(root, id, r);
    offLive = onLive((lid) => {
      if (lid !== id) return;
      const nr = recompute(id, style);
      if (nr) paint(root, id, nr);
    });
  }).catch(e => {
    if (my !== gen) return;
    root.querySelector('#body').innerHTML = `<div class="card"><p class="err">${errorText(friendlyError(e))}</p></div>`;
  });
}

function paint(root, id, r) {
  const { res } = r;
  const bt = res.backtest;
  const open = new Set([...root.querySelectorAll('details[open]')].map(d => d.dataset.id));
  const sorted = [...res.votes].sort((a, b) => Math.abs(b.v * b.w) - Math.abs(a.v * a.w));
  const items = sorted.map(v => {
    const meta = STRATEGY_INDEX[v.id] || EXTRA[v.id];
    const tag = v.v > 0.24 ? `<span class="vtag up">${t('buy')}</span>` : v.v < -0.24 ? `<span class="vtag down">${t('sell')}</span>` : `<span class="vtag muted">—</span>`;
    return `<div class="strat">
      <div class="top"><span class="nm">${esc(L(meta.name))}</span>${tag}${voteBar(v.v)}</div>
      <div class="why">${esc(L(v.why))}</div>
      <details data-id="${v.id}"${open.has(v.id) ? ' open' : ''}><summary>${t('why')}</summary><div class="desc">${esc(L(meta.desc))}</div></details>
    </div>`;
  }).join('');
  root.querySelector('#body').innerHTML = `
    <div class="card">
      <h3>🧮 ${t('combined')}</h3>
      <div class="gauge">
        <span class="pill ${dirClass(res.dir)}">${dirWord(res.dir)}${res.strength === 'strong' ? `<span class="st">${t('strong')}</span>` : ''}</span>
        <div><div class="big num ${res.score >= 0 ? 'up' : 'down'}">${res.score >= 0 ? '+' : ''}${res.score.toFixed(0)}</div><div class="small muted">${t('score')} (−100 … +100)</div></div>
      </div>
      <div class="conf mt"><div class="lbl"><span>${t('confidence')}</span><span class="num">${res.confidence}%</span></div><div class="bar"><i style="width:${res.confidence}%"></i></div></div>
      <div class="row mt small muted" style="flex-wrap:wrap">
        <span>${t('regime_' + res.regime.id)}${res.regime.adx ? ` (ADX ${num(res.regime.adx.toFixed(0))})` : ''}</span>
        ${res.htfBias != null ? `<span>· ${t('mtf')}: <b class="${res.htfBias > 0 ? 'up' : res.htfBias < 0 ? 'down' : ''}">${res.htfBias > 0.3 ? t('bullish') : res.htfBias < -0.3 ? t('bearish') : t('neutral')}</b></span>` : ''}
        ${res.dxyBias != null ? `<span>· DXY: <b>${res.dxyBias > 0.3 ? '↑' : res.dxyBias < -0.3 ? '↓' : '→'}</b></span>` : ''}
      </div>
      ${res.note ? `<div class="wait-box mt">${esc(L(res.note))}</div>` : ''}
    </div>
    <div class="card">
      <h3>📊 ${t('backtest')}</h3>
      <div class="stats">
        <div><div class="v num">${bt.trades ? Math.round(bt.winRate * 100) + '%' : '—'}</div><div class="k">${t('winRate')}</div></div>
        <div><div class="v num">${bt.trades}</div><div class="k">${t('trades')}</div></div>
        <div><div class="v num ${bt.avgR >= 0 ? 'up' : 'down'}">${(bt.avgR >= 0 ? '+' : '') + bt.avgR.toFixed(2)}R</div><div class="k">${t('avgR')}</div></div>
        <div><div class="v num">${Number.isFinite(bt.profitFactor) ? bt.profitFactor.toFixed(2) : '∞'}</div><div class="k">${t('pf')}</div></div>
      </div>
      <p class="small muted">${L({
        ar: `اختبرنا نفس المحرّك على آخر ${bt.bars} شمعة بلا ما يشوف المستقبل: دخول على إغلاق الشمعة، نص الصفقة بيطلع على هدف 1 ووقف الخسارة بينقل للدخول، والباقي على هدف 2. وإذا شمعة لمست الوقف والهدف سوا، منحسبها خسارة.`,
        en: `Same engine replayed on the last ${bt.bars} candles with no look-ahead: enter at the candle close, take half at TP1 and move the stop to breakeven, rest at TP2. A candle touching both SL and TP counts as a loss.`,
      })}</p>
    </div>
    <div class="card"><h3>🧠 ${t('allStrategies')} (${res.votes.length})</h3>${items}</div>`;
}
