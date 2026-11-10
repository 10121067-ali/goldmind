import { t, L, applyDir } from '../i18n.js';
import { store } from '../store.js';
import { INSTRUMENTS, STYLES } from '../config.js';
import { usage } from '../data.js';
import { testProvider } from '../ai.js';
import { enableAlerts } from '../alerts.js';
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
      <div class="field"><label>${t('groqKey')}</label><input type="password" id="gq" value="${esc(s.groqKey)}" autocomplete="off" placeholder="gsk_..."></div>
      <div class="field"><label>${t('geminiKey')}</label><input type="password" id="gm" value="${esc(s.geminiKey)}" autocomplete="off" placeholder="AIza..."></div>
      <div class="row"><button class="btn gold" id="save">${t('save')}</button><button class="btn" id="test">${t('testKeys')}</button><span id="msg" class="small"></span></div>
      <div id="testres" class="small mt"></div>
      <details class="mt"><summary class="small" style="color:var(--gold2)">${t('howKeys')}</summary>
        <div class="help mt">${L({
          ar: `<b>Twelve Data (مجاني، 800 طلب باليوم):</b><ol><li>افتح <a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com/register</a> وسجّل بإيميلك</li><li>من الـ Dashboard، روح على <b>API Keys</b></li><li>انسخ المفتاح وحطّو فوق</li></ol>
               <b>Groq (مجاني، بلا بطاقة):</b><ol><li>افتح <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> وفوت بحساب Gmail</li><li>اكبس <b>Create API Key</b>، حطّلو أي اسم</li><li>انسخو (بيبلّش بـ gsk_) وحطّو فوق، واكبس حفظ وبعدين جرّب المفاتيح</li></ol>
               <b>Gemini (اختياري):</b> <span class="muted">بعض الحسابات Google ما بتعطيها مجاني. إذا طلعلك "free tier is not available"، اتركو فاضي واعتمد على Groq.</span>
               <span class="muted">المفاتيح بتنحفظ بس على تلفونك، وما بتنرفع على أي مكان.</span>`,
          en: `<b>Twelve Data (free, 800 credits/day):</b><ol><li>Open <a href="https://twelvedata.com/register" target="_blank" rel="noopener">twelvedata.com/register</a> and sign up</li><li>Dashboard → <b>API Keys</b></li><li>Copy the key into the field above</li></ol>
               <b>Groq (free, no card):</b><ol><li>Open <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> and sign in with Google</li><li>Click <b>Create API Key</b> and give it any name</li><li>Copy it (starts with gsk_), paste above, Save, then Test keys</li></ol>
               <b>Gemini (optional):</b> <span class="muted">Some Google accounts get no free tier. If you see "free tier is not available", leave it empty and use Groq.</span>
               <span class="muted">Keys are stored only on this phone and never uploaded anywhere.</span>`,
        })}</div></details>
    </div>

    <div class="card">
      <h3>💼 ${L({ ar: 'حسابي وحجم الصفقة', en: 'My account & position size' })}</h3>
      <div class="row" style="gap:10px">
        <div class="field" style="flex:1"><label>${L({ ar: 'رصيد الحساب ($)', en: 'Account balance ($)' })}</label><input type="number" inputmode="decimal" min="0" id="bal" value="${s.balance || ''}" placeholder="1000"></div>
        <div class="field" style="flex:1"><label>${L({ ar: 'المخاطرة بالصفقة (%)', en: 'Risk per trade (%)' })}</label><input type="number" inputmode="decimal" min="0.1" max="10" step="0.1" id="risk" value="${s.riskPct}"></div>
      </div>
      <p class="small muted">${L({
        ar: 'بس تحط رصيدك، كل خطة بتطلعلك معها كم لوت تفوت، وقدّيش بتخسر إذا ضرب الوقف وقدّيش بتربح عالأهداف بالدولار. (ذهب: 1 لوت = 100 أونصة، فضة: 5000، نفط: 1000 برميل. تأكّد من مواصفات الوسيط تبعك.)',
        en: 'With a balance set, every plan shows the lot size and the dollar loss at the stop and gain at each target. (Gold 1 lot = 100 oz, silver 5000, oil 1000 bbl; check your broker.)',
      })}</p>
    </div>

    <div class="card">
      <h3>🔔 ${L({ ar: 'تنبيهات السعر', en: 'Price alerts' })}</h3>
      <div class="seg" id="alerts">
        <button data-a="1" class="${s.alerts ? 'on' : ''}">${L({ ar: 'شغّالة', en: 'On' })}</button>
        <button data-a="0" class="${s.alerts ? '' : 'on'}">${L({ ar: 'مطفية', en: 'Off' })}</button>
      </div>
      <p class="small muted mt">${L({
        ar: 'بيرنّ التلفون وبيهزّ وبيطلع إشعار لمّا السعر يوصل لدخول خطة جاهزة أو لأقرب دعم أو مقاومة. بيشتغل والتطبيق مفتوح (أو مفتوح من شوي بالخلفية).',
        en: 'Rings, vibrates and notifies when price reaches a pending-order entry or the nearest support/resistance. Works while the app is open (or briefly in the background).',
      })}</p><div id="alertmsg" class="small"></div>
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
  const acct = () => {
    const bal = Math.max(0, parseFloat(root.querySelector('#bal').value) || 0);
    const risk = Math.min(10, Math.max(0.1, parseFloat(root.querySelector('#risk').value) || 1));
    store.set({ balance: bal, riskPct: risk });
  };
  root.querySelector('#bal').onchange = acct;
  root.querySelector('#risk').onchange = acct;
  root.querySelector('#alerts').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const am = root.querySelector('#alertmsg');
    if (b.dataset.a === '1') {
      const perm = await enableAlerts();
      am.innerHTML = perm === 'granted' ? `<span class="up">✓ ${L({ ar: 'الإشعارات مسموحة', en: 'Notifications allowed' })}</span>`
        : `<span class="down">${L({ ar: 'الإشعارات مش مسموحة، بس الرنّة والهزّة والتنبيه جوّا التطبيق شغّالين. فيك تسمح فيها من إعدادات Chrome للموقع.', en: 'Notifications blocked; in-app sound, vibration and banner still work. Allow them in Chrome site settings.' })}</span>`;
    } else { store.set({ alerts: false }); am.textContent = ''; }
    root.querySelectorAll('#alerts button').forEach(x => x.classList.toggle('on', x === b));
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
    store.set({
      tdKey: root.querySelector('#td').value.trim(),
      groqKey: root.querySelector('#gq').value.trim(),
      geminiKey: root.querySelector('#gm').value.trim(),
      geminiModel: '',
    });
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
    for (const [name, label, key] of [['groq', 'Groq', store.get('groqKey')], ['gemini', 'Gemini', store.get('geminiKey')]]) {
      if (!key) continue;
      try {
        const m = await testProvider(name, key);
        lines.push(`${label}: <span class="up">${t('ok')}</span> → ${esc(m)}`);
      } catch (e) {
        const hint = /free tier is not available|billing/i.test(e.message)
          ? L({ ar: ' ← حسابك ما بيعطي Gemini مجاني. اعتمد على Groq.', en: ' ← No free Gemini for this account. Use Groq.' }) : '';
        lines.push(`${label}: <span class="down">${t('fail')}</span> ${esc(e.message.slice(0, 160))}${esc(hint)}`);
      }
    }
    out.innerHTML = lines.join('<br>') || '—';
  };
  root.querySelector('#clear').onclick = () => {
    Object.keys(localStorage).filter(k => k.startsWith('gm.c.') || k.startsWith('gm.sym.')).forEach(k => localStorage.removeItem(k));
    msg.textContent = '✓';
    render(root);
  };
}
