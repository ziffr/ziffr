// The Metric slugs the person typed into the Settings node: empty skips that figure, anything else must be a slug, so a
// placeholder left in place stops the run with the setting's name.
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const s = $('Settings').first().json;
const want = (name) => {
  const v = String(s[name] ?? '').trim();
  if (v === '') return '';
  if (!SLUG.test(v)) throw new Error('Settings: ' + name + ' is not a Metric slug (lower case letters, digits and hyphens), or leave it empty to skip that figure.');
  return v;
};
// The month that has just ended, in UTC: its first day (as a period), and its first and last instants.
const now = new Date();
const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
const period = new Date(from).toISOString().slice(0, 10);
