// Pipedrive: the won deals changed since the quarter began and all open deals, every page. Closed this quarter counts a
// deal by the moment it was marked won; the pipeline counts an open deal by its expected close date. Pipedrive does not
// convert in this list, so every counted deal must be in the one currency of the Settings node.
const ownerKey = (id) => String(id);
const currency = String($('Settings').first().json.currency ?? '').trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Settings: currency is the three letters of the currency your deals are in, such as EUR.');
const dealsOf = (node) => {
  const pages = $(node).all().map((i) => i.json);
  if (!pages.length || !pages.every((p) => p.success === true && (Array.isArray(p.data) || p.data === null))) throw new Error('Pipedrive did not answer with a list of deals (' + node + '). No figure was sent.');
  const last = pages[pages.length - 1];
  if (last.additional_data && last.additional_data.next_cursor) throw new Error('Pipedrive has more deals than this template reads (' + node + '). No figure was sent.');
  // A deal that moves to another page while they are read is counted once.
  return [...new Map(pages.flatMap((p) => p.data || []).map((d) => [d.id, d])).values()].filter((d) => d.is_deleted !== true);
};
// A time Pipedrive writes without a zone is in UTC.
const instant = (v) => {
  const t = String(v ?? '').trim().replace(' ', 'T');
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : t + 'Z');
};
let unpriced = 0;
let undated = 0;
const others = new Set();
const take = (deal, kind) => {
  if (deal.value === null || deal.value === undefined) unpriced++;
  const amount = Number(deal.value ?? 0);
  if (!Number.isFinite(amount)) throw new Error('Pipedrive gave a value that is not a number. No figure was sent.');
  if (amount !== 0 && String(deal.currency ?? '').toUpperCase() !== currency) others.add(String(deal.currency ?? '').slice(0, 3).toUpperCase() || 'none');
  lines.push({ owner: String(deal.owner_id ?? ''), kind, amount, category: '' });
};
for (const d of dealsOf('Read won deals')) {
  if (d.status !== 'won') continue;
  const at = instant(d.won_time);
  if (!Number.isFinite(at)) throw new Error('Pipedrive gave a won deal without the time it was won. No figure was sent.');
  if (at >= week.fromMs && at < week.wonBeforeMs) take(d, 'won');
}
for (const d of dealsOf('Read open deals')) {
  if (d.status !== 'open') continue;
  const day = String(d.expected_close_date ?? '').slice(0, 10);
  if (day === '') { undated++; continue; }
  if (day >= week.quarterFirst && day <= week.quarterLast) take(d, 'open');
}
if (others.size) throw new Error('Some deals of this quarter are not in ' + currency + ' (' + [...others].slice(0, 10).join(', ') + '). This template adds up one currency only. No figure was sent.');
if (unpriced) notes.push({ why: unpriced + ' deal(s) have no value and count as 0' });
if (undated) notes.push({ why: undated + ' open deal(s) have no expected close date and are not in the pipeline' });
