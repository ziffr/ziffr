// Signs the request exactly as Ziffr signs its messages: HMAC-SHA256 of "<timestamp>.<raw body>" with the Webhook's secret.
// Needs NODE_FUNCTION_ALLOW_BUILTIN=crypto on a self-hosted n8n.
const crypto = require('crypto');
const cfg = $('Settings').first().json;
const base = String(cfg.ziffrUrl).replace(/\/+$/, '');
return $input.all().map((item) => {
  const body = JSON.stringify(item.json.ziffr);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'sha256=' + crypto.createHmac('sha256', cfg.secret).update(timestamp + '.' + body).digest('hex');
  return { json: { url: base + '/api/webhooks/' + encodeURIComponent(cfg.webhookId) + '/in', body, timestamp, signature, op: item.json.ziffr.op, ref: item.json.ref || item.json.ziffr.ref, text: item.json.ziffr.text, ts: item.json.ts } };
});
