// @@LABEL@@ -> Ziffr (spec 0043), the part that is about the source: the rows read from @@LABEL@@ become plain rows
// { row, metric, value, period }. Each row names a Metric by its slug (as Ziffr shows it in the Metric's address), gives a
// number, and may give the period's first day (YYYY-MM-DD); a row without a period is the current period. Nothing else is
// copied out of a row: no other column goes on. The checks, and what is sent, are in the node after this one.
const rows = $input.all().map((item, n) => ({ row: n + 2, metric: item.json.metric, value: item.json.value, period: item.json.period }));
return [{ json: { rows, none: 'No row holds a Metric slug and a number: the columns are metric, value and, if you like, period.' } }];
