// The newest messages of our own bot that start with a Ziffr ref, as plain top-level messages. Nobody else's message counts.
const cfg = $('Settings').first().json;
const res = $input.first().json;
if (!res.ok) throw new Error('Slack said: ' + res.error);
const mine = (res.messages || []).filter((m) => m.type === 'message' && !m.subtype && m.bot_id && m.user === cfg.botUserId && typeof m.text === 'string' && (!m.thread_ts || m.thread_ts === m.ts) && /^Ziffr ref: [A-Za-z0-9]+-\d+[ \t]*$/.test(m.text.split(/\r?\n/)[0]));
const whole = !res.has_more && mine.length <= 40;
return mine.slice(0, 40).map((m) => ({ json: { ref: /^Ziffr ref: (\S+)/.exec(m.text)[1], ts: m.ts, channel: cfg.channel, whole } }));
