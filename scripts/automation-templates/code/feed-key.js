// Ziffr says which periods already hold a value (the node "What is filled", GET /api/v1/feed, as @ziffr/feed-kit does): a past
// period that has one is not sent again, so a rerun, a manual run or a later run never overwrites, adds to or doubles what is
// there, whatever the Metric's Submission Rule. The current period is always sent: its value may still change.
const overview = $('What is filled').first().json;
const listed = overview && overview.metrics && Array.isArray(overview.metrics.items) ? overview.metrics.items : [];
if (overview && overview.metrics && overview.metrics.next) throw new Error('This Feed submits to more than 200 Metrics; this template reads that many at most. No figure was sent.');
const metricOf = new Map(listed.map((m) => [m.slug, m]));
const send = items.filter((i) => {
  const m = metricOf.get(i.metric);
  return !(m && i.period && i.period !== m.current && Array.isArray(m.filled) && m.filled.includes(i.period));
});
const settled = items.length - send.length;
if (send.length === 0) return [];
// One run sends once, also when n8n retries it: the same figures give the same key, other figures another.
let h = 5381;
const body = JSON.stringify(send);
for (let i = 0; i < body.length; i++) h = ((h * 33) ^ body.charCodeAt(i)) >>> 0;
const key = '@@SYSTEM@@-' + h.toString(36) + '-' + send.length;
