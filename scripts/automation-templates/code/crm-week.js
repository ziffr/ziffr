// Which week, and which quarter (the CRM forecast templates share this node). The figures are for the week that ended
// last (Monday to Sunday, as Ziffr counts weeks) in the time zone of the Settings node. The quarter is the one that
// week starts in, counted from the month your Workspace's year starts in, which Ziffr says ("What is filled").
//  - Pipeline, commit and best case are what the CRM says at the moment of the run, so they are sent only when the run is
//    on Monday or Tuesday: a later run never files today's pipeline under last week. Closed this quarter is read by the
//    close date, so it can be sent on any day.
//  - A week Ziffr still counts as running (it counts days on its own server, normally in UTC) is not sent: it would not
//    count as past, and a second run could then replace it.
const DAY = 86400000;
const s = $('Settings').first().json;
const zone = String(s.timeZone ?? '').trim();
let clock;
try {
  if (zone === '') throw new Error('empty');
  clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
} catch {
  throw new Error('Settings: timeZone is not a time zone. Write it like Europe/Berlin, America/New_York or UTC.');
}
// The time of day a clock in that zone shows at an instant, written as if it were UTC.
const wall = (at) => {
  const p = Object.fromEntries(clock.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
};
// The instant a day begins in that zone (asked twice, since the clocks may change in between).
const startOfDay = (day) => {
  const guess = day - (wall(day) - day);
  return day - (wall(guess) - guess);
};
const iso = (day) => new Date(day).toISOString().slice(0, 10);

const today = Math.floor(wall(Date.now()) / DAY) * DAY;
const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
const weekFirst = today - (sinceMonday + 7) * DAY;
const period = iso(weekFirst);

const overview = $('What is filled').first().json;
const yearStart = overview.year_start_month;
if (!Number.isInteger(yearStart) || yearStart < 1 || yearStart > 12) throw new Error('Ziffr did not say which month your year starts in; check the Ziffr address and the Feed Key. No figure was sent.');
const first = new Date(weekFirst);
const into = (first.getUTCMonth() - (yearStart - 1) + 12) % 12;
const quarterFirst = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - (into % 3), 1);
const next = new Date(quarterFirst);
const quarterEnd = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 3, 1);
// Deals won count up to the end of the week, but never past the quarter the week belongs to.
const wonLast = Math.min(weekFirst + 6 * DAY, quarterEnd - DAY);

// Every Metric named here must be weekly, and the week must be over for Ziffr too.
const named = new Set(['closedMetric', 'pipelineMetric', 'commitMetric', 'bestCaseMetric'].map((k) => String(s[k] ?? '').trim()));
for (const line of [].concat($('Owners').first().json.owners ?? [])) for (const v of Object.values(line ?? {})) named.add(String(v).trim());
const listed = overview.metrics && Array.isArray(overview.metrics.items) ? overview.metrics.items : [];
for (const m of listed.filter((x) => named.has(x.slug))) {
  if (m.period !== 'week') throw new Error('The Metric ' + m.slug + ' is not weekly. These figures are weekly: use weekly Metrics. No figure was sent.');
  if (typeof m.current === 'string' && m.current <= period) throw new Error('Ziffr still counts the week of ' + period + ' as running (it counts days in its server\'s time, normally UTC). Run this later on Monday, after 00:00 UTC. No figure was sent.');
}
@@CHECK@@
return [{ json: {
  period,
  quarterFirst: iso(quarterFirst),
  quarterLast: iso(quarterEnd - DAY),
  wonLast: iso(wonLast),
  // The same bounds as instants, for a CRM that keeps dates with a time of day.
  fromMs: startOfDay(quarterFirst),
  wonBeforeMs: startOfDay(wonLast + DAY),
  beforeMs: startOfDay(quarterEnd),
  changedSince: new Date(startOfDay(quarterFirst) - DAY).toISOString().slice(0, 19) + 'Z',
  snapshot: sinceMonday <= 1,
} }];
