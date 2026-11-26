// Shape values (spec 0043): the one node every Feed template shares. The source node before it hands over plain rows
// { metric, value, period?, row? } and nothing else; this node is what makes them safe to send, whatever the source is:
//  - each row is checked as Ziffr would check it (a Metric slug, a plain number, a period written as a day), a row that fails is
//    skipped and said so, the same Metric and period twice is skipped, and at most 500 are sent;
//  - Ziffr is asked which periods already hold a value (the node "What is filled", GET /api/v1/feed, as @ziffr/feed-kit does) and a
//    past period that has one is not sent again, so a rerun, a manual run or a later run never overwrites, adds to or doubles what
//    is there, whatever the Metric's Submission Rule; the current period is always sent, since its value may still change;
//  - the key is made from the figures alone, so a retried run records nothing twice.
// Only { metric, period, value } leaves: no other field of a row is read.
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const MAX_ITEMS = 500;
const given = $input.first().json;
const rows = Array.isArray(given.rows) ? given.rows : [];
const skipped = Array.isArray(given.skipped) ? [...given.skipped] : [];
const items = [];
const seen = new Set();
rows.forEach((r, n) => {
  const row = r.row ?? n + 1;
  const metric = String(r.metric ?? '').trim();
  const raw = typeof r.value === 'number' ? String(r.value) : String(r.value ?? '').trim();
  const period = String(r.period ?? '').trim();
  if (metric === '' && raw === '' && period === '') return;
  if (!SLUG.test(metric)) { skipped.push({ row, why: 'the metric is not a Metric slug' }); return; }
  if (!NUMBER.test(raw)) { skipped.push({ row, metric, why: 'the value is not a plain number' }); return; }
  if (period !== '' && !DAY.test(period)) { skipped.push({ row, metric, why: 'the period is not a day written YYYY-MM-DD' }); return; }
  const at = metric + '/' + period;
  if (seen.has(at)) { skipped.push({ row, metric, why: 'the same Metric and period appear twice' }); return; }
  seen.add(at);
  if (items.length >= MAX_ITEMS) { skipped.push({ row, metric, why: 'more than ' + MAX_ITEMS + ' rows' }); return; }
  items.push(period === '' ? { metric, value: Number(raw) } : { metric, period, value: Number(raw) });
});
if (items.length === 0) throw new Error(String(given.none || 'No figure to send: nothing holds a Metric slug and a number.'));

const overview = $('What is filled').first().json;
const listed = overview && overview.metrics && Array.isArray(overview.metrics.items) ? overview.metrics.items : [];
if (overview && overview.metrics && overview.metrics.next) throw new Error('This Feed submits to more than 100 Metrics; this template reads that many at most (use a second Feed for the rest). No figure was sent.');
const metricOf = new Map(listed.map((m) => [m.slug, m]));
const send = items.filter((i) => {
  const m = metricOf.get(i.metric);
  return !(m && i.period && i.period !== m.current && Array.isArray(m.filled) && m.filled.includes(i.period));
});
const settled = items.length - send.length;
if (send.length === 0) return [];

let h = 5381;
const body = JSON.stringify(send);
for (let i = 0; i < body.length; i++) h = ((h * 33) ^ body.charCodeAt(i)) >>> 0;
const key = '@@SYSTEM@@-' + h.toString(36) + '-' + send.length;
return [{ json: { items: send, skipped, settled, key } }];
