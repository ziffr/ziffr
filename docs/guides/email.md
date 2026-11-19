# Email

Ziffr can send real email and take replies to it ([spec 0004](../specs/0004-real-email.md)). Prompts asking for a number, reminders, questions, tasks and replies in Threads go out through your SMTP server. A reply records the number, answers in the Thread or proposes a Correction. Without the settings below nothing is sent: messages stay in the Outbox, as before. The demo never sends email.

## Sending

Set three things where Ziffr runs:

```sh
ZIFFR_SITE_URL=https://ziffr.example.com          # links in emails lead here
ZIFFR_SMTP_URL=smtps://user:password@smtp.example.com:465
ZIFFR_MAIL_FROM="Ziffr <ziffr@example.com>"
```

Any provider with SMTP works. Use an address on a domain whose SPF and DKIM include that provider, or the mail lands in spam. Emails are plain text.

A send that fails is tried again after 1, 2, 4 and 8 minutes, then marked as not sent. Something has to run the retries: have a scheduler call the job every few minutes ([scheduled jobs](jobs.md)).

```sh
ZIFFR_JOB_SECRET=$(openssl rand -hex 32)
# every 5 minutes, from cron or your platform's scheduler:
curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://ziffr.example.com/api/jobs/deliveries
```

The Outbox on the Connectors page shows each email as **Emailed**, **Waiting to send** or **Not sent**, with the reason.

**Limits.** A workspace sends at most 500 emails a day. One inbox gets at most 20 an hour from all workspaces together, however its address is written (a `+tag` or Gmail's dots make no other inbox). One person causes at most 300 a day from all their workspaces. Emails over a limit wait in the queue and go out with a later run of the job; they hold up nobody else's. Invitations have limits of their own: 50 a day per workspace and per person, and three a day to one inbox.

## Taking replies

Each email gets a reply address of its own, `reply+<token>@<your inbound domain>`. Your mail provider receives replies there and forwards each one to Ziffr.

1. Pick a domain only for replies, such as `in.ziffr.example.com`, and point its MX records at a provider that can hand you incoming mail.
2. Set:

   ```sh
   ZIFFR_INBOUND_DOMAIN=in.ziffr.example.com
   ZIFFR_INBOUND_SECRET=$(openssl rand -hex 32)
   ZIFFR_INBOUND_AUTHSERV_ID=<see below>
   ```

3. Forward each incoming message, unchanged, to `POST https://ziffr.example.com/api/inbound/email`, signed:
   - `X-Ziffr-Timestamp`: the time in Unix seconds;
   - `X-Ziffr-Signature`: `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<raw message>` with the secret.

   Ziffr takes nothing unsigned, older than five minutes or larger than 1 MB. It also takes at most 30 messages an hour from one sender and 1,000 an hour in all, so a flood of mail to the reply domain stops before any reply address is looked up.

**Checking senders.** Anyone can write any `From` address. `ZIFFR_INBOUND_AUTHSERV_ID` names the provider that received the message. Ziffr then takes a reply only when that provider's own `Authentication-Results` header, the topmost one, says DMARC or DKIM passed for the sender's domain. To find the name, look at a message your provider received: it is the first word of its topmost `Authentication-Results` header. Without this setting, replies are checked by their reply address and `From` alone, and Approvals are never taken by email.

**What a reply does.**
- **To a Prompt:** the number is recorded, or a Breakdown with one row per line ("Shop 30"). The Metric's Submission Rule, Locks and Approvals apply, and the person gets a short email saying what became of it. If the Metric does not take values by email, they get their form link instead.
- **To a question or task:** the reply lands in the Thread. A line `Correction: 1234` proposes a Correction.
- **What is ignored:** quoted text and signatures are left out. Ziffr also ignores:
  - replies from another address than the one the email went to;
  - auto-replies;
  - a message it has already taken;
  - replies after 30 days.

### A forwarder on Cloudflare Email Routing

Cloudflare Email Routing can send incoming mail to an Email Worker, which forwards it signed. Add `ZIFFR_URL` and `ZIFFR_INBOUND_SECRET` as the Worker's variables, and route `*@in.ziffr.example.com` to it:

```js
export default {
  async email(message, env) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ZIFFR_INBOUND_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = new Uint8Array([...new TextEncoder().encode(`${ts}.`), ...raw]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
    const signature = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
    const res = await fetch(`${env.ZIFFR_URL}/api/inbound/email`, {
      method: "POST",
      headers: { "content-type": "message/rfc822", "x-ziffr-timestamp": ts, "x-ziffr-signature": `sha256=${signature}` },
      body: raw,
    });
    if (!res.ok) message.setReject("Not taken");
  },
};
```

### Other providers

Any provider that can give you each incoming message raw works, through a small forwarder that signs it as above. Postmark, Mailgun and Amazon SES, for example, can store the raw message or pass it to a webhook or a function. In Node the signature is:

```js
import { createHmac } from "node:crypto";
const signature = createHmac("sha256", process.env.ZIFFR_INBOUND_SECRET).update(`${ts}.`).update(raw).digest("hex");
```

Check the forwarder sends the message as received: changing it would break the provider's `Authentication-Results`.

## Opting out

Every Prompt and reminder email has a one-click link, also in the `List-Unsubscribe` header that mail clients show. Using it stops Prompts and reminders by email for that person in that workspace, and the owners of the Metrics they submit to are told. Questions, tasks and replies in their Threads keep coming. A member can turn them on again on the Connectors page.

## Trying it locally

Local Supabase runs Mailpit. Start Ziffr with `ZIFFR_SMTP_URL=smtp://127.0.0.1:55425`, `ZIFFR_MAIL_FROM` and `ZIFFR_SITE_URL=http://localhost:3000`, and every email lands at http://127.0.0.1:55424. The database tests send real mail there.
