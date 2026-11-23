// @@LABEL@@ -> Ziffr (spec 0043), the part that is about the source: the rows of one Excel table become plain rows
// { row, metric, value, period }. The table has the columns metric (the Metric's slug), value (a plain number) and,
// optionally, period (the period's first day). Header names are read without regard to capitals or spaces around them.
// Excel keeps a date as a number of days since 30 December 1899 (a cell that shows 2026-10-01 holds 46296): that number
// is turned into the day it stands for, in UTC; text that is already a day is left as it is. Nothing else is copied out
// of a row. The checks, and what is sent, are in the node after this one.
const lower = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
const SERIAL = /^\d{1,7}(\.\d+)?$/;
const asDay = (p) => {
  if (typeof p === 'number' || (typeof p === 'string' && SERIAL.test(p.trim()))) {
    const days = Math.floor(Number(p));
    // 1 is 1900-01-01; 60 is Excel's imaginary 1900-02-29; the day count below is right from 1900-03-01 on, which is all a period needs.
    if (days < 61 || days > 2958465) return String(p);
    return new Date(Date.UTC(1899, 11, 30) + days * 86400000).toISOString().slice(0, 10);
  }
  return p;
};
const rows = $input.all().map((item, n) => {
  const r = lower(item.json);
  return { row: n + 2, metric: r.metric, value: r.value, period: asDay(r.period) };
});
return [{ json: { rows, none: 'No row holds a Metric slug and a number: the table has the columns metric, value and, if you like, period.' } }];
