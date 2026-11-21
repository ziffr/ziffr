// @@LABEL@@ -> Ziffr: which tasks with a Ziffr ref were ticked or un-ticked since we last told Ziffr, and which got a "Reply:" line.
const SYSTEM = '@@SYSTEM@@';
const LIMIT = 100;
@@HELPERS@@
const state = $getWorkflowStaticData('global');
state.reported = state.reported || {};
state.replied = state.replied || {};
const tasks = @@GETTASKS@@;
const out = [];
const present = new Set();
for (const t of tasks) {
  // Ziffr's block is the first lines up to the LAST whole line that is the marker; its first line holds the ref.
  const lines = t.notes.split(/\r?\n/);
  let end = -1;
  lines.forEach((l, i) => { if (/^--- end of Ziffr text ---[ \t]*$/.test(l)) end = i; });
  const m = end < 0 ? null : /^Ziffr ref: ([A-Za-z0-9]+-\d+)[ \t]*$/.exec(lines[0]);
  if (!m) continue;
@@REFCHECK@@
  const ref = m[1];
  present.add(ref);
  const was = state.reported[ref];
  if (t.done && was !== 'done') out.push({ json: { ref, ziffr: { op: 'done', system: SYSTEM, external_id: t.id } } });
  else if (!t.done && was === 'done') out.push({ json: { ref, ziffr: { op: 'reopen', system: SYSTEM, external_id: t.id } } });
  const reply = lines.slice(end + 1).map((l) => /^Reply:[ \t]*(.+)$/.exec(l)).find((x) => x);
  const text = reply ? Array.from(reply[1].trim()).slice(0, 1000).join('') : '';
  if (text && state.replied[ref] !== text) out.push({ json: { ref, ziffr: { op: 'reply', system: SYSTEM, external_id: t.id, text } } });
}
// Forget what is no longer in a list we saw whole; Ziffr allows 60 requests a minute, so a run sends at most 30.
const whole = @@WHOLE@@;
if (whole) for (const k of Object.keys(state.reported)) if (!present.has(k)) delete state.reported[k];
if (whole) for (const k of Object.keys(state.replied)) if (!present.has(k)) delete state.replied[k];
return out.slice(0, 30);
