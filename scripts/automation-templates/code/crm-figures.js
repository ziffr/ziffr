// @@LABEL@@ -> Ziffr: the week's sales forecast figures. The first part of this node reads what @@LABEL@@ answered and makes
// one plain line { owner, kind, amount, category } per deal that counts: kind is 'won' (this quarter, up to the week's end)
// or 'open' (can still close this quarter), category '' , 'commit' or 'upside'. The next node gets the rows
// { metric, period, value } and notes for the person running it, which may name owner ids and stay in n8n. Only the rows
// are sent to Ziffr: no deal, name, email or owner id leaves n8n.
// What is sent:
//  - closed: the amounts won;  pipeline: the amounts open (those in the commit too, those won not);
@@RULES@@//  - the team's figures add up every owner; a line in Owners adds up that owner's deals only;
//  - 0 is sent when the CRM showed deals and the figure's own deals add up to nothing. When it showed no deal at all
//    (for the team, or for an owner of the table), nothing is sent: that is more often a missing right or a wrong id
//    than a real nothing, and a missing value can be typed in, while a wrong 0 would stay.
const week = $('Week').first().json;
const lines = [];
const notes = [];
@@SOURCE@@

// ---- the same for every CRM from here on ----
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const OWNER = /^[A-Za-z0-9]{1,40}$/;
const FIGURES = [@@FIGURES@@];
const s = $('Settings').first().json;
const slugIn = (value, where, optional) => {
  const v = String(value ?? '').trim();
  // The commit and best case settings are optional: left as they came, they send nothing.
  if (v === '' || (optional && v.startsWith('REPLACE-WITH-'))) return '';
  if (!SLUG.test(v)) throw new Error(where + ' is not a Metric slug (lower case letters, digits and hyphens), or leave it empty to skip that figure.');
  return v;
};
const used = new Set();
const once = (slug) => {
  if (!slug) return slug;
  if (used.has(slug)) throw new Error('The Metric ' + slug + ' is named twice (Settings or Owners); each figure needs its own. No figure was sent.');
  used.add(slug);
  return slug;
};
const team = {};
for (const f of FIGURES) team[f] = once(slugIn(s[f + 'Metric'], 'Settings: ' + f + 'Metric', f === 'commit' || f === 'bestCase'));

const table = $('Owners').first().json.owners;
if (!Array.isArray(table)) throw new Error('Owners: OWNERS is not a list.');
const seenOwners = new Set();
const people = table.map((line, i) => {
  const where = 'Owners, line ' + (i + 1);
  const owner = String(line?.owner ?? '').trim();
  if (!OWNER.test(owner)) throw new Error(where + ': owner is not an owner id (letters and digits only, as the CRM shows it).');
  const extra = Object.keys(line).filter((k) => k !== 'owner' && !FIGURES.includes(k));
  if (extra.length) throw new Error(where + ': “' + extra[0].slice(0, 40) + '” is not known; a line takes owner, ' + FIGURES.join(', ') + '.');
  if (seenOwners.has(ownerKey(owner))) throw new Error(where + ': the same owner appears twice.');
  seenOwners.add(ownerKey(owner));
  const slugs = {};
  for (const f of FIGURES) slugs[f] = once(slugIn(line[f], where + ': ' + f, false));
  return { owner, slugs };
});
if (used.size === 0) throw new Error('Name at least one Metric to fill, in the Settings node or in Owners.');

const sum = (list) => list.reduce((total, l) => total + l.amount, 0);
const figuresOf = (list) => {
  const won = sum(list.filter((l) => l.kind === 'won'));
  const open = list.filter((l) => l.kind === 'open');
  return {
    closed: won,
    pipeline: sum(open),
    commit: won + sum(open.filter((l) => l.category === 'commit')),
    bestCase: won + sum(open.filter((l) => l.category !== '')),
  };
};
const rows = [];
let late = false;
const add = (slugs, list, nobody) => {
  if (!Object.values(slugs).some(Boolean)) return;
  if (list.length === 0) { notes.push({ why: nobody }); return; }
  const values = figuresOf(list);
  for (const f of FIGURES) {
    if (!slugs[f]) continue;
    if (f !== 'closed' && !week.snapshot) { late = true; continue; }
    rows.push({ metric: slugs[f], period: week.period, value: Math.round(values[f] * 100) / 100 });
  }
};
add(team, lines, '@@LABEL@@ showed no deal at all for this quarter: nothing is sent for the team (not 0). Check that the login may see the deals.');
for (const p of people) add(p.slugs, lines.filter((l) => ownerKey(l.owner) === ownerKey(p.owner)), '@@LABEL@@ showed no deal of owner ' + p.owner + ' for this quarter: nothing is sent for them (not 0). Check the id.');
if (late) notes.push({ why: 'Pipeline, commit and best case are what the CRM says today, so they are sent only on a Monday or Tuesday. Only closed this quarter was sent for the week of ' + week.period + '.' });
// Ids only, to help fill the table: whose deals are in this read and have no line.
const unlisted = [...new Set(lines.map((l) => l.owner).filter((o) => o !== '' && !seenOwners.has(ownerKey(o))))].filter((o) => OWNER.test(o));
if (unlisted.length) notes.push({ why: 'Owner ids with deals and no line in Owners (they count towards the team only): ' + unlisted.slice(0, 50).join(', ') + (unlisted.length > 50 ? ' and more' : '') });
return [{ json: { rows, skipped: notes, none: 'Nothing was sent for the week of ' + week.period + '. ' + notes.map((n) => n.why).join(' ') } }];
