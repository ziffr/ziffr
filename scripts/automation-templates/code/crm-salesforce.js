// Salesforce: sums it works out itself (SUM ... GROUP BY), so no opportunity is read, only totals per owner and forecast
// category. In an org with several currencies Salesforce gives these totals in the org's default currency.
// An owner id may be pasted with 15 or 18 characters; the first 15 say who it is.
const ownerKey = (id) => String(id).slice(0, 15);
const KNOWN = ['Omitted', 'Pipeline', 'BestCase', 'MostLikely', 'Forecast', 'Closed'];
const totalsOf = (node) => {
  const answer = $(node).first().json;
  if (!Array.isArray(answer.records)) throw new Error('Salesforce did not answer with totals (' + node + '). No figure was sent.');
  // A grouped query hands out at most 2,000 rows and no further page.
  if (answer.done !== true || answer.records.length >= 2000) throw new Error('Salesforce has more groups than one query hands out (' + node + '). No figure was sent.');
  return answer.records;
};
let unpriced = 0;
const take = (node, kind) => {
  for (const r of totalsOf(node)) {
    const amount = r.amountSum === null || r.amountSum === undefined ? 0 : Number(r.amountSum);
    if (!Number.isFinite(amount)) throw new Error('Salesforce gave a total that is not a number. No figure was sent.');
    unpriced += Math.max(0, Number(r.dealCount || 0) - Number(r.pricedCount || 0));
    const c = r.ForecastCategory;
    if (kind === 'open' && c !== null && c !== undefined && !KNOWN.includes(c)) throw new Error('Salesforce named a forecast category this template does not know: ' + String(c).slice(0, 40) + '. No figure was sent.');
    const category = kind !== 'open' ? '' : c === 'Forecast' ? 'commit' : c === 'BestCase' || c === 'MostLikely' ? 'upside' : '';
    lines.push({ owner: String(r.OwnerId ?? ''), kind, amount, category });
  }
};
take('Read won totals', 'won');
take('Read open totals', 'open');
if (unpriced) notes.push({ why: unpriced + ' opportunity(ies) have no amount and count as 0' });
