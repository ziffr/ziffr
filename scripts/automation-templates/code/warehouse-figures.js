// @@LABEL@@ -> Ziffr (spec 0048), the part that is about the source: the rows your query returned become plain rows
// { row, metric, value, period }. The query gives each row the columns metric (the Metric's slug), value (a number) and
// period (the period's first day). Column names are read without regard to capitals, because a warehouse may write them
// in upper case (Snowflake does). A day that comes as a full timestamp ("2026-10-01T00:00:00.000Z") is cut to the day, in
// UTC; a number the warehouse gave as text is left for the node after this one to check. Nothing else is copied out of a
// row, so no other column leaves n8n. The checks, and what is sent, are in the node after this one.
const lower = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
const asDay = (p) => {
  const v = p && typeof p === 'object' && 'value' in p ? p.value : p;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v.trim())) return v.trim().slice(0, 10);
  return v;
};
const rows = $input.all().map((item, n) => {
  const r = lower(item.json);
  return { row: n + 1, metric: r.metric, value: r.value, period: asDay(r.period) };
});
return [{ json: { rows, none: 'The query returned no row with a Metric slug and a number: it must return the columns metric, value and period.' } }];
