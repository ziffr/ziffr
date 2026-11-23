// Ziffr's answer to a batch of values (spec 0043): one result per item, in the order sent. A refused item fails the run,
// so that n8n shows it as failed and its owner looks; the rest were recorded all the same (each item stands on its own).
const results = Array.isArray($input.first().json.results) ? $input.first().json.results : [];
const shaped = $('Shape values').first().json;
const refused = results.filter((r) => r.status === 'refused');
if (refused.length) {
  const why = refused.slice(0, 10).map((r) => String(r.metric) + ' ' + String(r.period ?? '') + ' (' + String(r.code ?? 'refused') + '): ' + String(r.detail)).join('; ');
  throw new Error('Ziffr refused ' + refused.length + ' of ' + results.length + ' values: ' + why + (refused.length > 10 ? '; and more' : ''));
}
const count = (s) => results.filter((r) => r.status === s).length;
return [{ json: { recorded: count('recorded'), waitingForApproval: count('awaiting_approval'), proposedAsCorrection: count('locked'), alreadyThere: shaped.settled, skippedRows: shaped.skipped } }];
