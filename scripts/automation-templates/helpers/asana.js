const TASKS = (res) => (res.data || []).map((t) => ({ id: t.gid, title: t.name, done: !!t.completed, notes: t.notes || '', url: t.permalink_url || ('https://app.asana.com/0/0/' + t.gid) }));
const TASK = (res) => ({ id: res.data.gid, url: res.data.permalink_url || ('https://app.asana.com/0/0/' + res.data.gid) });
const ID = /^\d{1,20}$/;
const DUE = (due) => due || null;
const createBody = (title, notes, due, open) => ({ data: { name: title, notes, projects: [input.projectId], completed: !open, due_on: DUE(due) } });
const patchBody = (title, due, open) => ({ data: { name: title, due_on: DUE(due), completed: !open } });
const closeBody = () => ({ data: { completed: true } });
