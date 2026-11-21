// Slack -> Ziffr: for each of our messages, a reaction marks the Task done (removing it reopens), and each person's reply in ITS thread becomes a message in the Thread.
// Replies come only from the thread of a message our bot wrote; the channel at large is never read as a reply.
const SYSTEM = 'slack';
const cfg = $('Settings').first().json;
const state = $getWorkflowStaticData('global');
state.reported = state.reported || {};
state.replied = state.replied || {};
const ids = String(cfg.allowedUsers || '').split(',').map((s) => s.trim()).filter(Boolean);
const allowed = (u) => typeof u === 'string' && /^[A-Z0-9]{2,40}$/.test(u) && (ids.includes(u) || ids.includes('ANYONE'));
const DONE = ['white_check_mark', 'heavy_check_mark'];
const clean = (s) => Array.from(String(s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim()).slice(0, 1000).join('');
const roots = $('Our messages').all();
const threads = $input.all();
const out = [];
const present = new Set();
roots.forEach((r, i) => {
  const root = r.json;
  const thread = threads[i] && threads[i].json;
  if (!thread || !thread.ok || !Array.isArray(thread.messages) || !thread.messages[0] || thread.messages[0].ts !== root.ts) return;
  const ref = root.ref;
  const external = root.channel + ':' + root.ts;
  present.add(ref);
  const ticked = (thread.messages[0].reactions || []).some((x) => DONE.includes(x.name) && (x.users || []).some((u) => u !== cfg.botUserId && allowed(u)));
  const was = state.reported[ref];
  if (ticked && was !== 'done') out.push({ json: { ref, ziffr: { op: 'done', system: SYSTEM, external_id: external } } });
  else if (!ticked && was === 'done') out.push({ json: { ref, ziffr: { op: 'reopen', system: SYSTEM, external_id: external } } });
  const last = Number(state.replied[ref] || 0);
  for (const m of thread.messages.slice(1)) {
    if (m.thread_ts !== root.ts || m.bot_id || (m.subtype && m.subtype !== 'thread_broadcast') || m.user === cfg.botUserId || !allowed(m.user) || typeof m.text !== 'string') continue;
    if (!(Number(m.ts) > last)) continue;
    const text = clean(m.text);
    if (text) out.push({ json: { ref, ts: m.ts, ziffr: { op: 'reply', system: SYSTEM, external_id: external, text } } });
  }
});
// Forget what is no longer in a channel we saw whole; Ziffr allows 60 requests a minute, so a run sends at most 30.
if (roots.length && roots[0].json.whole) {
  for (const k of Object.keys(state.reported)) if (!present.has(k)) delete state.reported[k];
  for (const k of Object.keys(state.replied)) if (!present.has(k)) delete state.replied[k];
}
return out.slice(0, 30);
