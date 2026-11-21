// Writes down what Ziffr took (200: done; 409: Ziffr's rules say no, asking again would not help), so it is not sent twice.
// A reply is remembered by its Slack time, and only if every earlier reply of that Action went through.
const state = $getWorkflowStaticData('global');
state.reported = state.reported || {};
state.replied = state.replied || {};
const sent = $('Sign request').all();
const blocked = new Set();
let handled = 0;
$input.all().forEach((res, i) => {
  const s = sent[i] && sent[i].json;
  const code = res.json.statusCode;
  if (!s) return;
  if (code !== 200 && code !== 409) { if (s.op === 'reply') blocked.add(s.ref); return; }
  if (blocked.has(s.ref)) return;
  handled++;
  if (s.op === 'done') state.reported[s.ref] = 'done';
  if (s.op === 'reopen') state.reported[s.ref] = 'open';
  if (s.op === 'reply') state.replied[s.ref] = s.ts;
});
return [{ json: { handled } }];
