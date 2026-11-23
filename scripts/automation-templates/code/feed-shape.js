// @@LABEL@@ -> Ziffr (spec 0043): the rows read from @@LABEL@@ become the items a Feed sends. Each row names a Metric by its
// slug (as Ziffr shows it in the Metric's address), gives a number, and may give the period's first day (YYYY-MM-DD);
// a row without a period is the current period. Nothing else leaves: no other column is sent.
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const MAX_ITEMS = 500;
const items = [];
const skipped = [];
const seen = new Set();
let row = 1;
for (const item of $input.all()) {
  row++;
  const r = item.json;
  const metric = String(r.metric ?? '').trim();
  const raw = typeof r.value === 'number' ? String(r.value) : String(r.value ?? '').trim();
  const period = String(r.period ?? '').trim();
  if (metric === '' && raw === '' && period === '') continue;
  if (!SLUG.test(metric)) { skipped.push({ row, why: 'the metric is not a Metric slug' }); continue; }
  if (!NUMBER.test(raw)) { skipped.push({ row, metric, why: 'the value is not a plain number' }); continue; }
  if (period !== '' && !DAY.test(period)) { skipped.push({ row, metric, why: 'the period is not a day written YYYY-MM-DD' }); continue; }
  const at = metric + '/' + period;
  if (seen.has(at)) { skipped.push({ row, metric, why: 'the same Metric and period appear twice' }); continue; }
  seen.add(at);
  if (items.length >= MAX_ITEMS) { skipped.push({ row, metric, why: 'more than ' + MAX_ITEMS + ' rows' }); continue; }
  items.push(period === '' ? { metric, value: Number(raw) } : { metric, period, value: Number(raw) });
}
if (items.length === 0) throw new Error('No row holds a Metric slug and a number: the columns are metric, value and, if you like, period.');
@@KEY@@
return [{ json: { items: send, skipped, settled, key } }];
