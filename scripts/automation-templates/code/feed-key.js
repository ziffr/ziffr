// One run sends once, also when n8n retries it: the same figures give the same key, other figures another.
let h = 5381;
const body = JSON.stringify(items);
for (let i = 0; i < body.length; i++) h = ((h * 33) ^ body.charCodeAt(i)) >>> 0;
const key = '@@SYSTEM@@-' + new Date().toISOString().slice(0, 10) + '-' + h.toString(36) + '-' + items.length;
