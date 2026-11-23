// HubSpot -> Ziffr (spec 0043): two counts for the month that has just ended, taken from HubSpot's own totals: deals won and
// new contacts. Only the two numbers leave: no deal, no contact, no name, no amount. A figure whose Metric slug is left empty
// is not sent.
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const s = $('Settings').first().json;
const want = (name) => {
  const v = String(s[name] ?? '').trim();
  if (v === '') return '';
  if (!SLUG.test(v)) throw new Error('Settings: ' + name + ' is not a Metric slug (lower case letters, digits and hyphens), or leave it empty to skip that figure.');
  return v;
};
const slugs = { won: want('dealsWonMetric'), contacts: want('newContactsMetric') };
if (!slugs.won && !slugs.contacts) throw new Error('Settings: name at least one Metric to fill.');
const totalOf = (node) => {
  const t = $(node).first().json.total;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw new Error('HubSpot did not say how many (' + node + '): no figure was sent.');
  return t;
};
// The month that has just ended, by its first day.
const now = new Date();
const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
const items = [];
if (slugs.won) items.push({ metric: slugs.won, period, value: totalOf('Count deals won') });
if (slugs.contacts) items.push({ metric: slugs.contacts, period, value: totalOf('Count new contacts') });
@@KEY@@
return [{ json: { items: send, settled, skipped: [], key } }];
