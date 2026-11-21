// Ziffr -> Slack: checks the signature, drops repeats and own echoes, and decides which message to post or tick.
// Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto on a self-hosted n8n.
const crypto = require('crypto');
const SYSTEM = 'slack';
const input = $input.first().json;
const headers = Object.fromEntries(Object.entries(input.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
const raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const out = (httpStatus, rest = {}) => [{ json: { httpStatus, action: 'none', ...rest } }];

// 1. The signature, over the raw body, within five minutes; a secret replaced in the last 24 hours may sign too (oldSecret).
const secrets = [input.secret, input.oldSecret].filter((s) => s && !String(s).startsWith('REPLACE'));
const timestamp = headers['x-ziffr-timestamp'] || '';
const given = (headers['x-ziffr-signature'] || '').split(',').map((h) => h.trim()).filter((h) => /^sha256=[0-9a-f]{64}$/.test(h));
let signed = /^\d{1,12}$/.test(timestamp) && Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
let match = false;
for (const secret of secrets) {
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex'));
  for (const g of given) if (g.length === expected.length && crypto.timingSafeEqual(Buffer.from(g), expected)) match = true;
}
if (!signed || !match) return out(401);

let event;
try { event = JSON.parse(raw); } catch (e) { return out(400); }
const d = event && event.data;
const isAlert = !!event && event.type === 'alert.fired';
if (!event || typeof event.type !== 'string' || !d || (!isAlert && (!event.type.startsWith('action.') || typeof d.ref !== 'string'))) return out(200);

// 2. Once per delivery: Ziffr sends at least once. Static data only lasts while the workflow is active.
const state = $getWorkflowStaticData('global');
state.seen = state.seen || {};
state.latest = state.latest || {};
const now = Date.now();
for (const [k, t] of Object.entries(state.seen)) if (now - t > 86400000) delete state.seen[k];
for (const [k, v] of Object.entries(state.latest)) if (now - v.t > 30 * 86400000) delete state.latest[k];
// The id in the signed body is the delivery id; the header is not signed, so it is not trusted.
const delivery = typeof event.id === 'string' ? event.id : '';
if (!delivery) return out(200);
if (state.seen[delivery]) return out(200, { why: 'repeat' });
state.seen[delivery] = now;

// 3. Not our own echo, only Tasks, only the newest news per Action.
if (d.source && d.source.type === 'webhook' && d.source.webhook_id === input.webhookId) return out(200, { why: 'echo' });
if (!isAlert && d.kind !== 'task') return out(200, { why: 'question' });
const seenUpdate = isAlert ? null : state.latest[d.ref];
if (seenUpdate && Date.parse(d.updated_at) < Date.parse(seenUpdate.u)) return out(200, { why: 'older' });
if (!isAlert) state.latest[d.ref] = { u: d.updated_at, t: now };

// 4. What to do. Slack's own marks (& < >) are escaped, so no name can ping @channel or open a link; line breaks go.
const esc = (s) => String(s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
const url = (u) => (/^https:\/\/\S+$/.test(String(u)) ? '<' + String(u).replace(/[<>|]/g, (c) => encodeURIComponent(c)).replace(/&/g, '&amp;') + '|Open in Ziffr>' : null);
const channel = input.channel;
const post = (text, extra = {}) => ({ channel, text, unfurl_links: false, unfurl_media: false, ...extra });
if (isAlert) {
  const m = d.metric && d.metric.name ? esc(d.metric.name) : 'A Metric';
  const text = [':rotating_light: *Alert:* ' + m + ', ' + esc(d.period) + ': ' + esc(d.value) + (d.target ? ' (target ' + esc(d.target) + ')' : ''), url(d.link)].filter(Boolean).join('\n');
  return out(200, { action: 'alert', alertBody: post(text) });
}
const slackLink = (d.external_ids || []).find((e) => e.system === SYSTEM);
const base = { ref: d.ref };
if (event.type === 'action.done') {
  const m = slackLink && /^([A-Z0-9]{2,40}):(\d{1,12}\.\d{1,8})$/.exec(String(slackLink.external_id));
  if (!m || m[1] !== channel) return out(200, { why: 'not linked' });
  return out(200, { ...base, action: 'done', doneBody: post('Done in Ziffr.', { thread_ts: m[2] }), tickBody: { channel, timestamp: m[2], name: 'white_check_mark' } });
}
if (event.type === 'action.created') {
  if (slackLink || d.status !== 'open') return out(200, { why: slackLink ? 'already linked' : 'closed and not linked' });
  const title = d.redacted ? 'A Ziffr task for you (' + esc(d.ref) + ')' : esc(d.title || d.ref);
  const text = ['Ziffr ref: ' + esc(d.ref), '*' + title + '*', !d.redacted && d.assignee ? 'For ' + esc(d.assignee.name) : null, d.due ? 'Due ' + esc(d.due) : null, !d.redacted && d.metric ? 'Metric: ' + esc(d.metric.name) : null, !d.redacted && d.asker ? 'Asked by: ' + esc(d.asker.name) : null, url(d.link), 'Reply in this thread, or react with :white_check_mark: to mark it done.'].filter(Boolean).join('\n');
  return out(200, { ...base, action: 'create', messageBody: post(text) });
}
return out(200, { why: 'nothing to do' });
