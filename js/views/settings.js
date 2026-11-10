import { t, L, applyDir } from '../i18n.js';
import { store } from '../store.js';
import { INSTRUMENTS, STYLES } from '../config.js';
import { usage } from '../data.js';
import { listModels, pickModel } from '../ai.js';
import { esc } from '../ui.js';

export function render(root) {
  const s = store.all();
  root.innerHTML = `
    <div class="card">
      <h3>🌐 ${t('language')}</h3>
      <div class="seg" id="lang">
        <button data-l="ar" class="${s.lang === 'ar' ? 'on' : ''}">العربية</button>
        <button data-l="en" class="${s.lang === 'en' ? 'on' : ''}">English</button>
      </div>
    </div>

    <div class="card">
      <h3>🔑 ${t('keys')}</h3>
      <div class="field"><label>${t('tdKey')}</label><input type="password" id="td" value="${esc(s.tdKey)}" autocomplete="off" placeholder="xxxxxxxxxxxxxxxx"></div>
      <div class="field"><label>${t('geminiKey')}</label><input type="password" id="gm" value="${esc(s.geminiKey)}" autocomplete="off" placeholder="AIza..."></div>
      <div class="field"><label>${t('model')}</label><select id="model"><option value="${esc(s.geminiModel)}">${esc(s.geminiModel || 'auto')}</option></select></div>
      <div class="row"><button class="btn gold" id="save">${t('save')}</button><button class="btn" id="test">${t('testKeys')}</button><span id="msg" class="small"></span></div>
      <div id="testres" class="small mt"></div>
      <details class="mt"><summary class="small" style="color:var(--gold2)">${t('howKeys')}</summary>
        <div class="help mt">${L({
          ar: `<b>Twelve Data (مجاني، 800 طلب باليوم):</b><ol><li>افتح <a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com/register</a> وسجّل بإيميلك</li><li>من الـ Dashboard، روح على <b>API Keys</b></li><li>انسخ المفتاح وحطّو فوق</li></ol>
               <b>Gemini (مجاني بحدود):</b><ol><li>افتح <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> بحساب Gmail</li><li>اكبس <b>Create API key</b></li><li>انسخو وحطّو فوق، واكبس حفظ وبعدين جرّب المفاتيح</li></ol>
               <span class="muted">المفاتيح بتنحفظ بس على تلفونك، وما بتنرفع على أي مكان.</span>`,
          en: `<b>Twelve Data (free, 800 credits/day):</b><ol><li>Open <a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com/register</a> and sign up</li><li>Dashboard → <b>API Keys</b></li><li>Copy the key into the field above</li></ol>
               <b>Gemini (free tier):</b><ol><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> with a Google account</li><li>Click <b>Create API key</b></li><li>Paste it above, Save, then Test keys</li></ol>
               <span class="muted">Keys are stored only on this phone and never uploaded anywhere.</span>`,
        })}</div></details>
    </div>

    <div class="card">
      <h3>🧭 ${t('style')}</h3>
      <div class="seg" id="style">${Object.entries(STYLES).map(([k, v]) => `<button data-k="${k}" class="${s.style === k ? 'on' : ''}">${L(v.label)}<small>${v.tfLabel}</small></button>`).join('')}</div>
    </div>

    <div class="card">
      <h3>📋 ${t('markets')}</h3>
      <div class="toggle-list">${INSTRUMENTS.map(x => `<label><input type="checkbox" data-id="${x.id}" ${s.enabled.includes(x.id) ? 'checked' : ''}> ${x.icon} ${esc(L(x.name))}</label>`).join('')}</div>
    </div>

    <div class="card">
      <h3>📶 ${t('usageToday')}</h3>
      <div class="conf"><div class="lbl"><span class="num">${usage.today()} / ${s.tdPerDay}</span></div><div class="bar"><i style="width:${Math.min(100, (100 * usage.today()) / s.tdPerDay)}%"></i></div></div>
      <p class="small muted">${L({
        ar: 'الشموع بتنحفظ عالتلفون، وما منطلبها من جديد إلا لمّا تقدم (بالسكالب كل 4 دقايق تقريباً). والسعر الحي ما بيستهلك رصيد.',
        en: 'Candles are cached on the phone and refetched only when stale (about every 4 minutes for scalping). Live prices use no credits.',
      })}</p>
      <button class="btn" id="clear">${L({ ar: 'مسح البيانات المحفوظة', en: 'Clear cached data' })}</button>
    </div>
    <p class="warn">GoldMind v1.0 · ${esc(t('disclaimer'))}</p>`;

  root.querySelector('#lang').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    store.set({ lang: b.dataset.l }); applyDir(); window.dispatchEvent(new Event('gm:relabel')); render(root);
  };
  root.querySelector('#style').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    store.set({ style: b.dataset.k }); render(root);
  };
  root.querySelectorAll('.toggle-list input').forEach(cb => cb.onchange = () => {
    const ids = [...root.querySelectorAll('.toggle-list input:checked')].map(x => x.dataset.id);
    store.set({ enabled: ids.length ? ids : ['XAU'] });
  });
  const msg = root.querySelector('#msg');
  const save = () => {
    const gm = root.querySelector('#gm').value.trim();
    const patch = { tdKey: root.querySelector('#td').value.trim(), geminiKey: gm };
    if (gm !== s.geminiKey) patch.geminiModel = '';
    const mv = root.querySelector('#model').value;
    if (mv && gm === s.geminiKey) patch.geminiModel = mv;
    store.set(patch);
    Object.keys(localStorage).filter(k => k.startsWith('gm.c.ai.')).forEach(k => localStorage.removeItem(k));
    msg.textContent = t('saved');
  };
  root.querySelector('#save').onclick = save;
  root.querySelector('#test').onclick = async () => {
    save();
    const out = root.querySelector('#testres');
    out.innerHTML = t('loading');
    const lines = [];
    const td = store.get('tdKey');
    if (td) {
      try {
        const r = await fetch(`https://api.twelvedata.com/api_usage?apikey=${encodeURIComponent(td)}`);
        const j = await r.json();
        lines.push(j.status === 'error' || j.code ? `Twelve Data: <span class="down">${t('fail')}</span> ${esc(j.message || '')}`
          : `Twelve Data: <span class="up">${t('ok')}</span> (${esc(j.plan_category || j.plan_limit || '')})`);
      } catch (e) { lines.push(`Twelve Data: <span class="down">${t('fail')}</span> ${esc(e.message)}`); }
    }
    const gk = store.get('geminiKey');
    if (gk) {
      try {
        const names = await listModels(gk);
        const best = pickModel(names);
        if (!store.get('geminiModel')) store.set({ geminiModel: best });
        const sel = root.querySelector('#model');
        sel.innerHTML = names.map(n => `<option value="${esc(n)}" ${n === store.get('geminiModel') ? 'selected' : ''}>${esc(n)}</option>`).join('');
        lines.push(`Gemini: <span class="up">${t('ok')}</span> → ${esc(store.get('geminiModel'))}`);
      } catch (e) { lines.push(`Gemini: <span class="down">${t('fail')}</span> ${esc(e.message)}`); }
    }
    out.innerHTML = lines.join('<br>') || '—';
  };
  root.querySelector('#clear').onclick = () => {
    Object.keys(localStorage).filter(k => k.startsWith('gm.c.') || k.startsWith('gm.sym.')).forEach(k => localStorage.removeItem(k));
    msg.textContent = '✓';
    render(root);
  };
}
