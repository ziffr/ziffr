const refOf = (title) => { const m = /^\[([A-Za-z0-9]+-\d+)\] /.exec(String(title || '')); return m ? m[1] : null; };
const taskUrl = (id) => 'https://tasks.office.com/Home/Task/' + encodeURIComponent(id);
// A Planner task keeps its text in a separate "details" object, so the ref also leads the title: "[ZIF-12] Send the report".
// For the lookup the title stands in for the first line of the notes.
const TASKS = (res) => (res.value || []).map((t) => ({ id: t.id, title: t.title, done: t.percentComplete === 100, notes: refOf(t.title) ? 'Ziffr ref: ' + refOf(t.title) : '', url: taskUrl(t.id) }));
const TASK = (res) => ({ id: res.id, url: taskUrl(res.id) });
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DUE = (due) => (due ? due + 'T00:00:00Z' : null);
const createBody = (title, notes, due, open) => { const b = { planId: input.planId, bucketId: input.bucketId, title: '[' + d.ref + '] ' + title, percentComplete: open ? 0 : 100 }; if (due) b.dueDateTime = DUE(due); return b; };
const patchBody = (title, due, open) => ({ title: '[' + d.ref + '] ' + title, dueDateTime: DUE(due), percentComplete: open ? 0 : 100 });
const closeBody = () => ({ percentComplete: 100 });
