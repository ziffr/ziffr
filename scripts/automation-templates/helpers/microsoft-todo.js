const ID = /^[A-Za-z0-9_=-]{1,200}$/;
const TASKS = (res) => (res.value || []).map((t) => ({ id: t.id, title: t.title, done: t.status === 'completed', notes: (t.body && t.body.content) || '', url: 'https://to-do.live.com/tasks/id/' + t.id + '/details' }));
const TASK = (t) => ({ id: t.id, url: 'https://to-do.live.com/tasks/id/' + t.id + '/details' });
const DUE = (due) => (due ? { dateTime: due + 'T00:00:00.0000000', timeZone: 'UTC' } : null);
const STATE = (open) => (open ? 'notStarted' : 'completed');
const createBody = (title, notes, due, open) => { const b = { title, body: { content: notes, contentType: 'text' }, status: STATE(open) }; if (due) b.dueDateTime = DUE(due); return b; };
const patchBody = (title, due, open) => ({ title, dueDateTime: DUE(due), status: STATE(open) });
const closeBody = () => ({ status: 'completed' });
