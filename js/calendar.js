// Economic calendar (ForexFactory weekly feed, bundled hourly by the deploy
// workflow into data/calendar.json so it is same-origin).

let memo = null;

export async function loadCalendar() {
  if (memo && Date.now() - memo.fetched < 15 * 6e4) return memo;
  try {
    const r = await fetch('./data/calendar.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const events = (j.events || []).map(e => ({
      title: e.title, country: e.country, impact: e.impact,
      time: Date.parse(e.date), forecast: e.forecast || '', previous: e.previous || '', actual: e.actual || '',
    })).filter(e => Number.isFinite(e.time));
    memo = { at: j.at ? Date.parse(j.at) : null, events, fetched: Date.now() };
  } catch {
    memo = { at: null, events: [], fetched: Date.now() };
  }
  return memo;
}

// Events that can move metals, oil and the dollar: everything USD from medium
// impact up, plus high-impact events from other majors and China.
export function relevant(events, id) {
  return events.filter(e => {
    if (e.impact === 'Holiday') return e.country === 'USD';
    if (e.country === 'USD') return e.impact === 'High' || e.impact === 'Medium';
    if (id === 'WTI' && /oil|crude|opec/i.test(e.title)) return true;
    return e.impact === 'High' && ['EUR', 'CNY', 'GBP', 'JPY'].includes(e.country);
  });
}

export const impactWeight = (e) => (e.impact === 'High' ? (e.country === 'USD' ? 3 : 1.8) : e.impact === 'Medium' ? 1.3 : 0);
