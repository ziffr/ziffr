// Tells Ziffr which message this Action is: "<channel>:<ts>", so every later event carries it in external_ids.
const SYSTEM = 'slack';
const v = $('Verify and filter').first().json;
const j = $input.first().json;
if (!j.exists && !j.ok) throw new Error('Slack said: ' + j.error);
const t = j.exists ? { id: j.taskId, url: j.taskUrl } : { id: j.channel + ':' + j.ts, url: 'https://slack.com/app_redirect?channel=' + encodeURIComponent(j.channel) + '&message_ts=' + encodeURIComponent(j.ts) };
return [{ json: { ziffr: { op: 'link', ref: v.ref, system: SYSTEM, external_id: t.id, url: t.url } } }];
