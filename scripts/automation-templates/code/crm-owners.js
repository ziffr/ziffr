// OWNERS: the one table to edit if salespeople have Metrics of their own, as the Sales forecast Pack makes them (its
// team figures are Totals, which take no values: leave the team's settings empty). Leave the list empty to send the
// team's figures only.
// One line per salesperson:
//   owner     @@OWNER@@
//   others    the slug of that person's Metric (the last part of the Metric's address in Ziffr). Leave one out, or
//             empty, to send nothing for it.
// Owner ids stay in n8n: Ziffr is sent only a slug, a week and a number.
const OWNERS = [
  // { owner: '@@EXAMPLE@@', closed: 'closed-this-quarter-ana', pipeline: 'pipeline-value-ana'@@MORE@@ },
];
return [{ json: { owners: OWNERS } }];
