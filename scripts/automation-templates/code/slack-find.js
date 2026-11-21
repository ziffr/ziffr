// A first event: is there a message of ours with this ref in the channel already (a retry, a lost link)? Then link that one.
// Only messages of our own bot count; a person's message can say whatever it likes.
const cfg = $('Settings').first().json;
const v = $('Verify and filter').first().json;
const res = $input.first().json;
if (!res.ok) throw new Error('Slack said: ' + res.error);
const found = (res.messages || []).find((m) => m.bot_id && m.user === cfg.botUserId && typeof m.text === 'string' && m.text.split(/\r?\n/)[0].trim() === 'Ziffr ref: ' + v.ref);
return [{ json: { ...v, exists: !!found, taskId: found ? cfg.channel + ':' + found.ts : undefined, taskUrl: found ? 'https://slack.com/app_redirect?channel=' + encodeURIComponent(cfg.channel) + '&message_ts=' + encodeURIComponent(found.ts) : undefined } }];
