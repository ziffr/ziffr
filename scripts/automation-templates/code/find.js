// A first event: is there a task with this ref in its notes already (a retry, a lost link)? Then link that one.
const SYSTEM = '@@SYSTEM@@';
@@HELPERS@@
const v = $('Verify and filter').first().json;
// Only a task that holds exactly what this workflow would have written is taken as its own; a task someone else made with the ref in it is not.
const found = TASKS($input.first().json).find((t) => @@MATCH@@);
return [{ json: { ...v, exists: !!found, taskId: found ? found.id : undefined, taskUrl: found ? found.url : undefined } }];
