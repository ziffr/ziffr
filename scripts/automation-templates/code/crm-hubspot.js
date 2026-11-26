// HubSpot: deals from its search, every page. The amount is the one in your company currency, which HubSpot converts.
// If your portal's forecast categories have other values than these, change them here.
const COMMIT = ['COMMIT'];
const UPSIDE = ['BEST_CASE', 'MOST_LIKELY'];
const ownerKey = (id) => String(id);
const dealsOf = (node) => {
  const pages = $(node).all().map((i) => i.json);
  if (!pages.length || !pages.every((p) => Array.isArray(p.results))) throw new Error('HubSpot did not answer with a list of deals (' + node + '). No figure was sent.');
  const last = pages[pages.length - 1];
  if (last.paging && last.paging.next) throw new Error('HubSpot has more deals than this template reads (' + node + '; a search hands out 10,000). No figure was sent.');
  // A deal that moves to another page while they are read is counted once.
  return [...new Map(pages.flatMap((p) => p.results).map((d) => [String(d.id), d.properties || {}])).values()];
};
const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// Commit and best case need the category values above to be HubSpot's own: asked once, only when one is wanted.
const wants = (f) => [$('Settings').first().json[f + 'Metric'], ...[].concat($('Owners').first().json.owners ?? []).map((l) => l?.[f])]
  .some((v) => given(v) && !String(v).trim().startsWith('REPLACE-WITH-'));
const needed = [...(wants('commit') || wants('bestCase') ? COMMIT : []), ...(wants('bestCase') ? [UPSIDE[0]] : [])];
if (needed.length) {
  const options = $('Read forecast categories').first().json.options;
  if (!Array.isArray(options)) throw new Error('Commit or best case is asked for, and HubSpot did not say which forecast categories there are. Empty those settings, or check the key (it needs to read deals). No figure was sent.');
  const values = options.map((o) => String(o.value));
  const missing = needed.filter((v) => !values.includes(v));
  if (missing.length) throw new Error('HubSpot has no forecast category ' + missing.join(', ') + '; it has: ' + values.join(', ').slice(0, 300) + '. Change COMMIT and UPSIDE at the top of the node Figures. No figure was sent.');
}

let unpriced = 0;
const amountOf = (p) => {
  if (given(p.amount_in_home_currency)) return Number(p.amount_in_home_currency);
  if (!given(p.amount)) { unpriced++; return 0; }
  if (given(p.deal_currency_code)) throw new Error('HubSpot gave a deal in ' + String(p.deal_currency_code).slice(0, 3) + ' without its amount in your company currency, so the deals cannot be added up. No figure was sent.');
  return Number(p.amount);
};
const take = (node, kind) => {
  for (const p of dealsOf(node)) {
    const amount = amountOf(p);
    if (!Number.isFinite(amount)) throw new Error('HubSpot gave an amount that is not a number. No figure was sent.');
    const c = String(p.hs_manual_forecast_category ?? '');
    const category = kind !== 'open' ? '' : COMMIT.includes(c) ? 'commit' : UPSIDE.includes(c) ? 'upside' : '';
    lines.push({ owner: String(p.hubspot_owner_id ?? ''), kind, amount, category });
  }
};
take('Read won deals', 'won');
take('Read open deals', 'open');
if (unpriced) notes.push({ why: unpriced + ' deal(s) have no amount and count as 0' });
