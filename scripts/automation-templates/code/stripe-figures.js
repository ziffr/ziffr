// Stripe -> Ziffr (spec 0043): three figures for the month that has just ended, worked out from the subscriptions Stripe lists:
// monthly recurring revenue, customers with a subscription, and customers who cancelled in that month. Only read data is
// used and only these numbers leave: no customer, no email, no id. A figure whose Metric slug is left empty is not sent.
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const s = $('Settings').first().json;
const want = (name) => {
  const v = String(s[name] ?? '').trim();
  if (v === '') return '';
  if (!SLUG.test(v)) throw new Error('Settings: ' + name + ' is not a Metric slug (lower case letters, digits and hyphens), or leave it empty to skip that figure.');
  return v;
};
const slugs = { mrr: want('mrrMetric'), customers: want('customersMetric'), churned: want('churnedMetric') };
if (!slugs.mrr && !slugs.customers && !slugs.churned) throw new Error('Settings: name at least one Metric to fill.');
const currency = String(s.currency ?? '').trim().toLowerCase();
if (!/^[a-z]{3}$/.test(currency)) throw new Error('Settings: currency is the three letters of the one currency to add up, such as eur.');

// Every page of one list; a list that Stripe says goes on after the last page we read is too big to add up, so the run fails
// rather than send a number that is too low.
const subscriptionsOf = (node) => {
  const pages = $(node).all().map((i) => i.json);
  if (pages.length && pages[pages.length - 1].has_more === true) throw new Error('Stripe lists more subscriptions than this template reads (' + node + '). Ask for a bigger template; no figure was sent.');
  return pages.flatMap((p) => (Array.isArray(p.data) ? p.data : []));
};
const live = subscriptionsOf('Read current subscriptions').filter((x) => x.status === 'active' || x.status === 'past_due');
const cancelled = subscriptionsOf('Read cancelled subscriptions');

// The month that has just ended, by its first day; Stripe's times are seconds since 1970 (UTC).
const now = new Date();
const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
const period = new Date(from).toISOString().slice(0, 10);

const customerOf = (x) => (typeof x.customer === 'string' ? x.customer : x.customer && typeof x.customer.id === 'string' ? x.customer.id : '');
const customers = new Set(live.map(customerOf).filter((c) => c !== ''));
const lost = new Set(cancelled.filter((x) => typeof x.canceled_at === 'number' && x.canceled_at * 1000 >= from && x.canceled_at * 1000 < to).map(customerOf).filter((c) => c !== '' && !customers.has(c)));

// A month's worth of one price, in the currency's own whole units. Only a plain price with an amount and a fixed interval
// counts; tiered, metered and other currencies are left out of the sum and counted in `left out`.
const PER_MONTH = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };
const DIVISOR = (c) => (['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'].includes(c) ? 1 : ['bhd', 'iqd', 'jod', 'kwd', 'lyd', 'omr', 'tnd'].includes(c) ? 1000 : 100);
let mrr = 0;
let leftOut = 0;
for (const sub of live) {
  const lines = sub.items && Array.isArray(sub.items.data) ? sub.items.data : [];
  for (const line of lines) {
    const p = line.price;
    const r = p && p.recurring;
    const factor = r ? PER_MONTH[r.interval] : undefined;
    if (!p || !r || factor === undefined || p.currency !== currency || typeof p.unit_amount !== 'number' || r.usage_type === 'metered' || !(r.interval_count >= 1)) { leftOut++; continue; }
    mrr += (p.unit_amount * (typeof line.quantity === 'number' ? line.quantity : 1) * factor) / r.interval_count / DIVISOR(currency);
  }
}

const items = [];
if (slugs.mrr) items.push({ metric: slugs.mrr, period, value: Math.round(mrr * 100) / 100 });
if (slugs.customers) items.push({ metric: slugs.customers, period, value: customers.size });
if (slugs.churned) items.push({ metric: slugs.churned, period, value: lost.size });
@@KEY@@
return [{ json: { items, skipped: leftOut ? [{ why: leftOut + ' price(s) left out of the revenue: tiered, metered, in another currency or without a fixed interval' }] : [], key } }];
