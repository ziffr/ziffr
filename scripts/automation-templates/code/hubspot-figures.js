// HubSpot -> Ziffr (spec 0043): two counts for the month that has just ended, taken from HubSpot's own totals: deals won and
// new contacts. Only the two numbers leave: no deal, no contact, no name, no amount. A figure whose Metric slug is left empty
// is not sent.
@@SETTINGS@@
const slugs = { won: want('dealsWonMetric'), contacts: want('newContactsMetric') };
if (!slugs.won && !slugs.contacts) throw new Error('Settings: name at least one Metric to fill.');
const totalOf = (node) => {
  const t = $(node).first().json.total;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw new Error('HubSpot did not say how many (' + node + '): no figure was sent.');
  return t;
};
const rows = [];
if (slugs.won) rows.push({ metric: slugs.won, period, value: totalOf('Count deals won') });
if (slugs.contacts) rows.push({ metric: slugs.contacts, period, value: totalOf('Count new contacts') });
return [{ json: { rows, skipped: [] } }];
