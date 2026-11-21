const ID = /^[A-Za-z0-9_=-]{1,100}$/;
const TASKS = (res) => (res.items || []).map((t) => ({ id: t.id, title: t.title, done: t.status === 'completed', notes: t.notes || '', url: t.webViewLink }));
const TASK = (t) => ({ id: t.id, url: t.webViewLink });
const DUE = (due) => (due ? due + 'T00:00:00.000Z' : null);
const STATE = (open) => (open ? 'needsAction' : 'completed');
const createBody = (title, notes, due, open) => { const b = { title, notes, status: STATE(open) }; if (due) b.due = DUE(due); return b; };
const patchBody = (title, due, open) => (open ? { title, due: DUE(due), status: STATE(true), completed: null } : { title, due: DUE(due), status: STATE(false) });
const closeBody = () => ({ status: 'completed' });
