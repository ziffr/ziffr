// Ziffr -> @@LABEL@@: checks the signature, drops repeats, own echoes and old news, and decides what to do.
// Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto on a self-hosted n8n.
const crypto = require('crypto');
const SYSTEM = '@@SYSTEM@@';
const LIMIT = 100;
@@HELPERS@@
const extra = @@EXTRA@@;
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
if (!event || typeof event.type !== 'string' || !event.type.startsWith('action.') || !d || typeof d.ref !== 'string') return out(200);

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
if (d.kind !== 'task') return out(200, { why: 'question' });
const seenUpdate = state.latest[d.ref];
if (seenUpdate && Date.parse(d.updated_at) < Date.parse(seenUpdate.u)) return out(200, { why: 'older' });
state.latest[d.ref] = { u: d.updated_at, t: now };

// 4. What to do. A redacted message has no title: the task says what it is and links back.
const link = (d.external_ids || []).find((e) => e.system === SYSTEM);
if (link && !ID.test(String(link.external_id))) return out(200, { why: 'bad id' });
const open = d.status === 'open';
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/-{3,}/g, "-").replace(/^\s*Reply:\s*/i, "").trim();
const title = d.redacted ? 'A Ziffr task for you (' + d.ref + ')' : @@TITLE@@;
const notes = ["Ziffr ref: " + clean(d.ref), clean(d.link), !d.redacted && d.metric ? "Metric: " + clean(d.metric.name) : null, !d.redacted && d.asker ? "Asked by: " + clean(d.asker.name) : null, "--- end of Ziffr text ---"].filter(Boolean).join("\n");
const base = { ref: d.ref };
if (event.type === 'action.done') return link ? out(200, { ...base, action: '@@CLOSE@@', taskId: link.external_id, patchBody: closeBody() }) : out(200, { why: 'not linked' });
if (event.type === 'action.created' || event.type === 'action.updated') {
  if (link) return out(200, { ...base, action: 'patch', taskId: link.external_id, patchBody: patchBody(title, d.due, open) });
  return open ? out(200, { ...base, action: 'create', notes, createBody: createBody(title, notes, d.due, open), ...extra(notes) }) : out(200, { why: 'closed and not linked' });
}
return out(200, { why: 'nothing to do' });
