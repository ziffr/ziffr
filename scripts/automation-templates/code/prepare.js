// Tells Ziffr which task this Action is, so every later event carries it in external_ids.
const SYSTEM = '@@SYSTEM@@';
@@HELPERS@@
const v = $('Verify and filter').first().json;
const j = $input.first().json;
const t = j.exists ? { id: j.taskId, url: j.taskUrl } : TASK(j);
return [{ json: { ziffr: { op: 'link', ref: v.ref, system: SYSTEM, external_id: t.id, url: t.url } } }];
