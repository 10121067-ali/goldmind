import { t, L, lang } from '../i18n.js';
import { store, cache } from '../store.js';
import { BY_ID } from '../config.js';
import { run, recompute, friendlyError } from '../service.js';
import { onLive } from '../data.js';
import { loadCalendar, relevant } from '../calendar.js';
import { dayProjection } from '../dayforecast.js';
import { generate, hasAI, md } from '../ai.js';
import { esc, fp, num, errorText, skeleton, leanText } from '../ui.js';

const STYLE = 'day'; // 15-minute candles regardless of the chosen trading style

let offLive = null, gen = 0;
export function destroy() { gen++; if (offLive) offLive(); offLive = null; }

const hm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayName = (ms) => new Date(ms).toLocaleDateString(lang() === 'ar' ? 'ar' : 'en', { weekday: 'short' });
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭' };

export function render(root, id) {
  destroy();
  const my = gen;
  id = BY_ID[id] ? id : (store.get('enabled')[0] || 'XAU');
  const inst = BY_ID[id];
  root.innerHTML = `
    <div class="chips">${store.get('enabled').map(x =>
      `<a class="chip ${x === id ? 'on' : ''}" href="#today/${x}" style="text-decoration:none;color:inherit">${BY_ID[x].icon} ${esc(L(BY_ID[x].name))}</a>`).join('')}</div>
    <div class="card mt" id="td-sum"><h3>🔮 ${L({ ar: 'توقّع اليوم', en: "Today's outlook" })} · ${esc(L(inst.name))}</h3>${skeleton(3)}</div>
    <div class="card" id="td-chart">${skeleton(6)}</div>
    <div class="card" id="td-events"><h3>📅 ${L({ ar: 'أحداث النهار', en: "Today's events" })}</h3>${skeleton(3)}</div>
    <div class="card" id="td-levels"><h3>🎯 ${L({ ar: 'احتمال لمس المستويات', en: 'Chance of touching key levels' })}</h3>${skeleton(3)}</div>
    <div class="card ai" id="td-ai"></div>
    <div class="card"><h3>ℹ️ ${L({ ar: 'كيف منحسب الرسمة؟', en: 'How is this drawn?' })}</h3><p class="small muted">${esc(L({
      ar: 'هيدي مش خط مضمون، هيدي مروحة احتمالات. منقيس من تاريخ السوق نفسو قدّيش بيتحرّك عادةً بكل ساعة من النهار (آسيا هادية، فتحة لندن ونيويورك حامية)، ومنعدّلها حسب نشاط السوق اليوم. بوقت الأخبار المهمّة منوسّع المروحة لأنو الحركة بتكبر، ومنميّلها حسب توقّع الاستراتيجيات. المنطقة الغامقة فيها السعر بـ 60% من الحالات، والفاتحة بـ 90%. وكل ما يتحرّك السعر الحي، الرسمة بتتحدّث.',
      en: 'This is not a guaranteed line but a probability fan. We measure from the market\'s own history how much it usually moves in each hour of the day (quiet Asia, busy London and New York opens), rescale to today\'s activity, widen the fan at high-impact news, and tilt it by the strategies\' forecast. The dark band holds price 60% of the time, the light one 90%. It updates with every live tick.',
    }))}</p></div>
    <p class="warn">${esc(t('disclaimer'))}</p>`;

  const levelsOf = (r) => {
    const z = r.zones, out = [];
    z.support.slice(0, 2).forEach((s, i) => out.push({ name: L({ ar: 'دعم', en: 'Support' }) + (i ? ' 2' : ''), code: 'SUP' + (i ? '2' : ''), price: (s.low + s.high) / 2, kind: 's' }));
    z.resistance.slice(0, 2).forEach((s, i) => out.push({ name: L({ ar: 'مقاومة', en: 'Resistance' }) + (i ? ' 2' : ''), code: 'RES' + (i ? '2' : ''), price: (s.low + s.high) / 2, kind: 'r' }));
    if (z.pivots) ['R1', 'P', 'S1'].forEach(k => out.push({ name: L({ ar: 'بيفوت ', en: 'Pivot ' }) + k, code: k === 'P' ? 'PP' : k, price: z.pivots[k], kind: 'p' }));
    return out.filter(x => Number.isFinite(x.price));
  };

  let cal = { events: [], at: null };
  let aiDone = false;
  const paint = (r) => {
    if (my !== gen) return;
    const evs = relevant(cal.events, id);
    const pj = dayProjection(r.ctx, r.res, levelsOf(r), evs);
    root._td = { r, pj };
    paintSummary(root, id, r, pj);
    paintChart(root, id, r, pj);
    paintEvents(root, pj, cal);
    paintLevels(root, id, pj);
    if (!aiDone) { aiDone = true; paintAI(root, id, r, pj, false); }
  };

  Promise.all([run(id, STYLE), loadCalendar()]).then(([r, c]) => {
    if (my !== gen) return;
    cal = c;
    paint(r);
    offLive = onLive((lid) => {
      if (lid !== id) return;
      const nr = recompute(id, STYLE);
      if (nr) paint(nr);
    });
  }).catch((e) => {
    if (my !== gen) return;
    const msg = `<p class="err">${errorText(friendlyError(e))}</p>`;
    ['#td-sum', '#td-chart', '#td-events', '#td-levels'].forEach(s => { root.querySelector(s).innerHTML = msg; });
  });
}

function paintSummary(root, id, r, pj) {
  const up = Math.round(pj.pUpClose * 100);
  const ahead = pj.events.filter(e => e.time > pj.t0 && e.impact !== 'Holiday');
  const next = ahead.find(e => e.impact === 'High') || ahead[0];
  const endLabel = new Date(pj.end - 1).toDateString() === new Date(pj.t0).toDateString()
    ? L({ ar: 'لآخر النهار', en: 'By end of day' })
    : L({ ar: 'لآخر نهار ', en: 'By end of ' }) + dayName(pj.end - 1);
  const act = pj.volRatio;
  const actTxt = act >= 1.25 ? L({ ar: `حامي، أعلى من العادة ×${act.toFixed(1)}`, en: `Hot, ${act.toFixed(1)}× usual` })
    : act <= 0.8 ? L({ ar: `هادي، أقل من العادة ×${act.toFixed(1)}`, en: `Quiet, ${act.toFixed(1)}× usual` })
      : L({ ar: 'عادي', en: 'Normal' });
  root.querySelector('#td-sum').innerHTML = `<h3>🔮 ${L({ ar: 'توقّع اليوم', en: "Today's outlook" })} · ${esc(L(BY_ID[id].name))}</h3>
    <div class="row between">
      <div><div class="small muted">${L({ ar: 'السعر هلّق', en: 'Price now' })}</div><div class="td-big num">${fp(pj.price, id)}</div></div>
      <div style="text-align:end"><div class="small muted">${esc(endLabel)}</div>
        <div class="fc-p" style="justify-content:flex-end"><span class="up ${up > 50 ? 'big' : ''}">▲ ${num(up + '%')}</span> <span class="down ${up < 50 ? 'big' : ''}">▼ ${num((100 - up) + '%')}</span></div></div>
    </div>
    <div class="td-grid mt">
      <div><div class="k">${L({ ar: 'الإغلاق المتوقّع (60%)', en: 'Expected close (60%)' })}</div><div class="v num">${fp(pj.close60[0], id)} – ${fp(pj.close60[1], id)}</div></div>
      <div><div class="k">${L({ ar: 'ميل السوق', en: 'Lean' })}</div><div class="v">${leanText(r.res.lean)}</div></div>
      <div><div class="k">${L({ ar: 'أعلى سعر متوقّع', en: 'Expected high' })}</div><div class="v num up">${fp(pj.expHigh, id)}</div></div>
      <div><div class="k">${L({ ar: 'أدنى سعر متوقّع', en: 'Expected low' })}</div><div class="v num down">${fp(pj.expLow, id)}</div></div>
      <div><div class="k">${L({ ar: 'نشاط السوق اليوم', en: 'Activity today' })}</div><div class="v">${esc(actTxt)}</div></div>
      <div><div class="k">${L({ ar: 'أهم خبر جايي', en: 'Next big event' })}</div><div class="v small">${next ? `${FLAG[next.country] || ''} <b class="num">${dayName(next.time)} ${hm(next.time)}</b> ${esc(next.title)}` : L({ ar: 'ما في أخبار قوية', en: 'No major news' })}</div></div>
    </div>`;
}

function paintChart(root, id, r, pj) {
  const ctx = r.ctx;
  const W = 400, H = 300, X0 = 4, X1 = 340, Y0 = 26, Y1 = 262;
  const bars = [];
  for (let j = 0; j < ctx.n; j++) if (ctx.t[j] >= pj.start) bars.push(j);
  const inRange = (p) => p >= pj.path.reduce((a, q) => Math.min(a, q.lo90), Infinity) * 0.998 && p <= pj.path.reduce((a, q) => Math.max(a, q.hi90), -Infinity) * 1.002;
  const lv = pj.levels.filter(l => inRange(l.price));
  let lo = Infinity, hi = -Infinity;
  bars.forEach(j => { lo = Math.min(lo, ctx.l[j]); hi = Math.max(hi, ctx.h[j]); });
  pj.path.forEach(q => { lo = Math.min(lo, q.lo90); hi = Math.max(hi, q.hi90); });
  lv.forEach(l => { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); });
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (tm) => X0 + ((tm - pj.start) / (pj.end - pj.start)) * (X1 - X0);
  const y = (p) => Y1 - ((p - lo) / (hi - lo)) * (Y1 - Y0);
  const f = (v) => v.toFixed(1);
  const parts = [];

  // Sessions (UTC): Asia 00–07, London 07–12:30, New York 12:30–21.
  const sessions = [[0, 7, '#5aa9ff', L({ ar: 'آسيا', en: 'Asia' })], [7, 12.5, '#e9b949', L({ ar: 'لندن', en: 'London' })], [12.5, 21, '#1fc77e', L({ ar: 'نيويورك', en: 'New York' })]];
  for (let d = new Date(pj.start).setUTCHours(0, 0, 0, 0) - 864e5; d < pj.end; d += 864e5) {
    for (const [a, b, col, name] of sessions) {
      const s = Math.max(pj.start, d + a * 36e5), e = Math.min(pj.end, d + b * 36e5);
      if (e <= s) continue;
      parts.push(`<rect x="${f(x(s))}" y="4" width="${f(x(e) - x(s))}" height="12" rx="3" fill="${col}" opacity=".22"/>`);
      if (x(e) - x(s) > 34) parts.push(`<text x="${f((x(s) + x(e)) / 2)}" y="13" fill="${col}" font-size="8.5" text-anchor="middle">${esc(name)}</text>`);
    }
  }
  // Grid and price axis.
  for (let i = 0; i <= 4; i++) {
    const p = lo + ((hi - lo) * i) / 4;
    parts.push(`<line x1="${X0}" x2="${X1}" y1="${f(y(p))}" y2="${f(y(p))}" stroke="#262f45" stroke-width=".6"/>`);
    parts.push(`<text x="${X1 + 4}" y="${f(y(p) + 3)}" fill="#8b95ab" font-size="8.5">${fp(p, id)}</text>`);
  }
  // Time axis (local), spaced so labels never overlap.
  const step = (pj.end - pj.start) > 30 * 36e5 ? 6 : 3;
  const t3 = new Date(pj.start); t3.setMinutes(0, 0, 0); t3.setHours(Math.ceil(t3.getHours() / step) * step);
  for (let tm = t3.getTime(); tm <= pj.end; tm += step * 36e5) {
    parts.push(`<line x1="${f(x(tm))}" x2="${f(x(tm))}" y1="${Y0}" y2="${Y1}" stroke="#1b2234" stroke-width=".6"/>`);
    parts.push(`<text x="${f(x(tm))}" y="${Y1 + 12}" fill="#8b95ab" font-size="8.5" text-anchor="middle">${hm(tm)}</text>`);
  }
  // Key levels.
  for (const l of lv) {
    const col = l.kind === 's' ? '#1fc77e' : l.kind === 'r' ? '#ff5470' : '#9aa4b8';
    parts.push(`<line x1="${X0}" x2="${X1}" y1="${f(y(l.price))}" y2="${f(y(l.price))}" stroke="${col}" stroke-width=".8" stroke-dasharray="3 3" opacity=".8"/>`);
    parts.push(`<text x="${X0 + 2}" y="${f(y(l.price) - 2)}" fill="${col}" font-size="8">${esc(l.code)} ${Math.round(l.pTouch * 100)}%</text>`);
  }
  // Probability fan.
  const fan = (a, b) => pj.path.map(q => `${f(x(q.t))},${f(y(q[a]))}`).concat(pj.path.slice().reverse().map(q => `${f(x(q.t))},${f(y(q[b]))}`)).join(' ');
  parts.push(`<polygon points="${fan('hi90', 'lo90')}" fill="#e9b949" opacity=".10"/>`);
  parts.push(`<polygon points="${fan('hi60', 'lo60')}" fill="#e9b949" opacity=".22"/>`);
  parts.push(`<polyline points="${pj.path.map(q => `${f(x(q.t))},${f(y(q.mid))}`).join(' ')}" fill="none" stroke="#f6d77a" stroke-width="1.4" stroke-dasharray="4 3"/>`);
  // Candles so far.
  const cw = Math.max(1, ((pj.barMs / (pj.end - pj.start)) * (X1 - X0)) * 0.7);
  for (const j of bars) {
    const up = ctx.c[j] >= ctx.o[j], col = up ? '#1fc77e' : '#ff5470';
    const cx = x(ctx.t[j] + pj.barMs / 2);
    parts.push(`<line x1="${f(cx)}" x2="${f(cx)}" y1="${f(y(ctx.h[j]))}" y2="${f(y(ctx.l[j]))}" stroke="${col}" stroke-width=".7"/>`);
    const top = y(Math.max(ctx.o[j], ctx.c[j])), bot = y(Math.min(ctx.o[j], ctx.c[j]));
    parts.push(`<rect x="${f(cx - cw / 2)}" y="${f(top)}" width="${f(cw)}" height="${f(Math.max(0.8, bot - top))}" fill="${col}"/>`);
  }
  // Events.
  for (const e of pj.events) {
    if (e.impact === 'Holiday') continue;
    const col = e.impact === 'High' ? '#ff5470' : '#f0a04b';
    const ex = x(e.time);
    parts.push(`<line x1="${f(ex)}" x2="${f(ex)}" y1="${Y0}" y2="${Y1}" stroke="${col}" stroke-width=".9" opacity="${e.time < pj.t0 ? '.35' : '.8'}"/>`);
    parts.push(`<circle cx="${f(ex)}" cy="${Y0 - 4}" r="4" fill="${col}" opacity="${e.time < pj.t0 ? '.4' : '1'}"/><text x="${f(ex)}" y="${Y0 - 1.5}" fill="#0b0e14" font-size="7" font-weight="700" text-anchor="middle">!</text>`);
  }
  // Now marker.
  const nx = x(pj.t0);
  parts.push(`<line x1="${f(nx)}" x2="${f(nx)}" y1="${Y0}" y2="${Y1}" stroke="#e8ecf4" stroke-width=".7" stroke-dasharray="2 2"/>`);
  parts.push(`<circle cx="${f(nx)}" cy="${f(y(pj.price))}" r="3.2" fill="#f6d77a" stroke="#0b0e14" stroke-width="1"/>`);
  parts.push(`<text x="${f(nx)}" y="${Y1 + 24}" fill="#e8ecf4" font-size="8.5" text-anchor="middle">${L({ ar: 'هلّق', en: 'now' })}</text>`);
  const lastQ = pj.path[pj.path.length - 1];
  parts.push(`<text x="${X1 + 4}" y="${f(y(lastQ.mid) + 3)}" fill="#f6d77a" font-size="8.5" font-weight="700">${fp(lastQ.mid, id)}</text>`);

  root.querySelector('#td-chart').innerHTML = `<h3>📈 ${L({ ar: 'الرسمة المتوقّعة لليوم', en: "Today's expected chart" })}</h3>
    <svg class="td-svg" viewBox="0 0 ${W} ${H}" role="img">${parts.join('')}</svg>
    <div class="td-legend small muted">
      <span><i style="background:rgba(233,185,73,.45)"></i>${L({ ar: '60% من الحالات', en: '60% of cases' })}</span>
      <span><i style="background:rgba(233,185,73,.18)"></i>${L({ ar: '90% من الحالات', en: '90% of cases' })}</span>
      <span><i style="background:#f6d77a;height:2px"></i>${L({ ar: 'المسار الأرجح', en: 'Most likely path' })}</span>
      <span><i style="background:#ff5470;border-radius:50%"></i>${L({ ar: 'خبر قوي', en: 'High-impact news' })}</span>
    </div>`;
}

function paintEvents(root, pj, cal) {
  const box = root.querySelector('#td-events');
  const head = `<h3>📅 ${L({ ar: 'أحداث النهار', en: "Today's events" })}</h3>`;
  const evs = pj.events.filter(e => e.impact !== 'Holiday' || e.country === 'USD');
  if (!evs.length) {
    box.innerHTML = head + `<p class="small muted">${cal.at ? L({ ar: 'ما في أخبار مهمّة بهالفترة.', en: 'No important news in this window.' }) : L({ ar: 'التقويم مش متوفّر هلّق.', en: 'Calendar unavailable right now.' })}</p>`;
    return;
  }
  box.innerHTML = head + `<div class="ev-list">${evs.map(e => `<div class="ev ${e.time < pj.t0 ? 'past' : ''}">
      <span class="ev-t num">${dayName(e.time)} ${hm(e.time)}</span>
      <span class="ev-i ${e.impact === 'High' ? 'hi' : e.impact === 'Medium' ? 'md' : 'lo'}"></span>
      <span class="ev-n">${FLAG[e.country] || e.country} ${esc(e.title)}</span>
      <span class="ev-v small muted">${e.actual ? `${L({ ar: 'الفعلي', en: 'Act' })} <b class="num">${esc(e.actual)}</b> · ` : ''}${e.forecast ? `${L({ ar: 'المتوقّع', en: 'Fcst' })} <b class="num">${esc(e.forecast)}</b>` : ''}${e.previous ? ` · ${L({ ar: 'السابق', en: 'Prev' })} <b class="num">${esc(e.previous)}</b>` : ''}</span>
    </div>`).join('')}</div>
    <p class="small muted mt">${L({ ar: 'المصدر: ForexFactory · الأوقات بتوقيت تلفونك', en: 'Source: ForexFactory · times in your phone\'s time zone' })}</p>`;
}

function paintLevels(root, id, pj) {
  const rows = pj.levels.slice().sort((a, b) => b.price - a.price);
  root.querySelector('#td-levels').innerHTML = `<h3>🎯 ${L({ ar: 'احتمال لمس المستويات', en: 'Chance of touching key levels' })}</h3>
    ${rows.map(l => {
      const p = Math.round(l.pTouch * 100);
      const col = l.kind === 's' ? 'var(--buy)' : l.kind === 'r' ? 'var(--sell)' : 'var(--wait)';
      return `<div class="lv-row"><span class="lv-n" style="color:${col}">${esc(l.name)}</span><b class="num">${fp(l.price, id)}</b>
        <div class="bar lv-bar"><i style="width:${p}%;background:${col}"></i></div><span class="num lv-p">${p}%</span></div>`;
    }).join('')}
    <p class="small muted">${L({ ar: 'يعني قدّيش في احتمال إنو السعر يوصل لهالمستوى قبل آخر النهار.', en: 'Probability that price reaches each level before the end of the window.' })}</p>`;
}

async function paintAI(root, id, r, pj, force) {
  const box = root.querySelector('#td-ai');
  if (!box) return;
  const header = `<h3>✨ ${L({ ar: 'الذكاء الاصطناعي يشرحلك النهار', en: 'AI walk-through of the day' })}<span class="sp"></span><button class="btn small" id="td-ai-go">${t('aiRun')}</button></h3>`;
  const bind = () => { const b = box.querySelector('#td-ai-go'); if (b) b.onclick = () => { const cur = root._td || { r, pj }; paintAI(root, id, cur.r, cur.pj, true); }; };
  if (!hasAI()) { box.innerHTML = header + `<p class="muted small">${t('aiNeedKey')} <a href="#settings">⚙️</a></p>`; return; }
  const ck = `ai.day5.${id}.${lang()}`;
  const hit = cache.get(ck);
  if (hit && !force && Date.now() - hit.at < 60 * 6e4) { show(hit.data); return; }
  if (!force) { box.innerHTML = header + `<p class="muted small">${L({ ar: 'اكبس "حلّل هلّق" ليشرحلك شو متوقّع اليوم ساعة بساعة.', en: 'Tap "Analyze now" for an hour-by-hour walk-through.' })}</p>`; bind(); return; }
  box.innerHTML = header + skeleton(5); bind();
  const inst = BY_ID[id], dp = inst.dp, fx = (v) => Number(v).toFixed(dp);
  const off = -new Date().getTimezoneOffset();
  const tz = `UTC${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ':' + String(Math.abs(off) % 60).padStart(2, '0') : ''}`;
  const dayKey = (ms) => new Date(ms).toDateString();
  const rel = (ms) => {
    const d = new Date(); const k = dayKey(ms);
    if (k === dayKey(d)) return 'today';
    if (k === dayKey(d.getTime() + 864e5)) return 'tomorrow';
    if (k === dayKey(d.getTime() - 864e5)) return 'yesterday';
    return new Date(ms).toLocaleDateString('en', { weekday: 'long' });
  };
  const lt = (ms) => `${rel(ms)} (${new Date(ms).toLocaleDateString('en', { weekday: 'short' })}) ${hm(ms)}`;
  const sess = (h) => hm(Date.UTC(2000, 0, 1, Math.floor(h), (h % 1) * 60));
  const evLines = pj.events.filter(e => e.time >= pj.t0 && e.impact !== 'Holiday')
    .map(e => `${lt(e.time)} ${e.country} ${e.impact} "${e.title}" fcst ${e.forecast || '-'} prev ${e.previous || '-'}`).join('\n') || 'none';
  const pastLines = pj.events.filter(e => e.time < pj.t0 && e.time > pj.t0 - 36 * 36e5 && e.impact !== 'Holiday')
    .map(e => `${lt(e.time)} ${e.country} ${e.impact} "${e.title}" ${e.actual ? `actual ${e.actual}` : 'released (check the web for the actual)'} fcst ${e.forecast || '-'} prev ${e.previous || '-'}`).join('\n');
  const NAMES = { buyLimit: 'BUY LIMIT (buy the dip at support)', sellLimit: 'SELL LIMIT (sell the rally at resistance)', buyStop: 'BUY STOP (buy a breakout above resistance)', sellStop: 'SELL STOP (sell a breakdown below support)' };
  const plans = (r.res.scenarios || []).map(s => `${NAMES[s.type] || s.type}: entry ${fx(s.entry)}, stop-loss ${fx(s.sl)}, TP1 ${fx(s.tp1)}, TP2 ${fx(s.tp2)}${s.likely ? ' [favoured by the lean]' : ''}`).join('\n') || 'none';
  const holidays = pj.events.filter(e => e.impact === 'Holiday').map(e => `${e.country} ${e.title}`).join(', ');
  const prompt = `You are a senior ${inst.name.en} intraday trader. All times below are the user's local time (${tz}). Now: ${lt(Date.now())}. Price ${fx(pj.price)}.
Sessions in local time: Asia ${sess(0)}-${sess(7)}, London ${sess(7)}-${sess(12.5)}, New York ${sess(12.5)}-${sess(21)}.
Our quantitative projection from now until ${lt(pj.end - 1)}:
- P(close higher than now) ${(pj.pUpClose * 100).toFixed(0)}%, 60% close range ${fx(pj.close60[0])}-${fx(pj.close60[1])}, expected high ${fx(pj.expHigh)}, expected low ${fx(pj.expLow)}, activity ${pj.volRatio.toFixed(2)}x usual.
- Engine signal: ${r.res.dir > 0 ? 'BUY' : r.res.dir < 0 ? 'SELL' : 'WAIT'}, lean ${r.res.lean > 0 ? 'bullish' : r.res.lean < 0 ? 'bearish' : 'neutral'}.
- Level touch probabilities: ${pj.levels.map(l => `${l.name} ${fx(l.price)} ${(l.pTouch * 100).toFixed(0)}%`).join('; ')}.
${pastLines ? `Already released (do not describe these as upcoming):\n${pastLines}\n` : ''}Upcoming scheduled events (local time), the only releases still ahead in this window:
${evLines}${holidays ? `\nBank holidays (thin liquidity, no data releases): ${holidays}` : ''}
Search the web for today's news on ${inst.name.en}, then write in ${lang() === 'ar' ? 'Lebanese/Levantine Arabic (keep tickers/indicator names in English)' : 'English'}, max 220 words, no tables:
### 🕐 
(from now until the end of the window only, never hours already past: the coming sessions and each event above, what is likely around it; use the local times exactly as given)
### 🎯 
(explain which of these pre-computed pending orders makes most sense today and when; copy their entry/stop/targets exactly, never create other orders or move stops; also say where to stay out:
${plans})
### ⚠️ 
(main risks today)
Use only the numbers above for levels; never invent prices or event times. Ignore web articles older than 3 days. For a buy the stop is always below entry, for a sell always above.`;
  try {
    const out = await generate(prompt);
    cache.set(ck, out);
    show(out);
  } catch (e) {
    box.innerHTML = header + `<p class="err">${t('aiError')}: ${esc(e.message)}</p>`; bind();
  }
  function show(out) {
    box.innerHTML = header + `<div class="ai-body">${md(out.text)}</div>` +
      (out.sources?.length ? `<div class="sources">${out.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join('')}</div>` : '') +
      `<div class="small muted mt">${esc(out.model || '')}</div>`;
    bind();
  }
}
