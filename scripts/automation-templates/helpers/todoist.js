const ID = /^[A-Za-z0-9_-]{1,40}$/;
const taskUrl = (id) => 'https://app.todoist.com/app/task/' + id;
const TASKS = (active, completed) => {
  const seen = new Set();
  const out = [];
  for (const t of (active && active.results) || []) { seen.add(String(t.id)); out.push({ id: String(t.id), title: t.content, done: false, notes: t.description || '', url: taskUrl(t.id) }); }
  for (const t of (completed && completed.items) || []) { const id = String(t.task_id || t.id); if (!seen.has(id)) { seen.add(id); out.push({ id, title: t.content, done: true, notes: t.description || '', url: taskUrl(id) }); } }
  return out;
};
const TASK = (res) => ({ id: String(res.id), url: taskUrl(res.id) });
const createBody = (title, notes, due, open) => { const b = { content: title, description: notes, project_id: input.projectId }; if (due) b.due_date = due; return b; };
const patchBody = (title, due, open) => (due ? { content: title, due_date: due } : { content: title, due_string: 'no date' });
const closeBody = () => ({});
