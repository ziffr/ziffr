// A fake Slack Web API for tests (spec 0007, testing decisions): a real HTTP server on this machine that answers the
// methods Ziffr calls the way Slack documents them, and records every call. The core reaches it through
// ZIFFR_SLACK_API_URL, as it would reach slack.com; nothing inside the core is replaced.
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";

/** One call the fake received: the method, its form fields, and the bot token it came with. */
export type FakeCall = { method: string; params: Record<string, string>; token: string | null; answer?: Record<string, unknown> };

/** A Slack user the fake knows. */
export type FakeUser = { id: string; email: string; deleted?: boolean; is_bot?: boolean; team_id?: string; real_name?: string };

/** The settings that turn Slack on for a test, pointing at the fake. */
export const SLACK_SETTINGS = {
  ZIFFR_SLACK_CLIENT_ID: "111.222", ZIFFR_SLACK_CLIENT_SECRET: "client-secret-for-tests", ZIFFR_SLACK_SIGNING_SECRET: "s".repeat(32),
  ZIFFR_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64"), ZIFFR_SITE_URL: "https://ziffr.example.test",
};

/** A random Slack-style id with a prefix, such as T… for a Slack workspace or U… for a user. */
export const slackId = (prefix: string) => `${prefix}${randomBytes(6).toString("hex").toUpperCase()}`;

/** Starts the fake and sets the Slack settings; `stop` ends it and puts the settings back. */
export async function fakeSlack() {
  const calls: FakeCall[] = [];
  const users: FakeUser[] = [];
  const fails: Record<string, { error?: string; status?: number; retryAfter?: number; times: number }> = {};
  let install = { team: { id: slackId("T"), name: "Acme" }, app_id: slackId("A"), bot_user_id: slackId("U"), access_token: `xoxb-${randomBytes(12).toString("hex")}`, is_enterprise_install: false, token_type: "bot", scope: "chat:write,chat:write.customize,im:write,im:history,users:read,users:read.email" };
  const tokens = new Set<string>();
  let ts = 1_700_000_000;
  const asSlackSays = (u: FakeUser) => ({ id: u.id, team_id: u.team_id ?? install.team.id, deleted: Boolean(u.deleted), is_bot: Boolean(u.is_bot), profile: { email: u.email, ...(u.real_name ? { real_name: u.real_name } : {}) } });
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const method = String(req.url).replace(/^\/api\//, "");
      const params = Object.fromEntries(new URLSearchParams(body));
      const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? null;
      calls.push({ method, params, token });
      const send = (status: number, json: Record<string, unknown>, headers: Record<string, string> = {}) => { calls[calls.length - 1].answer = json; res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(json)); };
      const f = fails[method];
      if (f && f.times > 0) {
        f.times--;
        if (f.status === 429) return send(429, { ok: false, error: "ratelimited" }, { "retry-after": String(f.retryAfter ?? 30) });
        return send(f.status ?? 200, { ok: false, error: f.error ?? "internal_error" });
      }
      if (method !== "oauth.v2.access" && (!token || !tokens.has(token))) return send(200, { ok: false, error: "invalid_auth" });
      switch (method) {
        case "oauth.v2.access": tokens.add(install.access_token); return send(200, { ok: true, ...install });
        case "auth.revoke": tokens.delete(token!); return send(200, { ok: true, revoked: true });
        case "users.lookupByEmail": {
          const u = users.find((x) => x.email.toLowerCase() === String(params.email).toLowerCase());
          return u ? send(200, { ok: true, user: asSlackSays(u) }) : send(200, { ok: false, error: "users_not_found" });
        }
        case "users.info": {
          const u = users.find((x) => x.id === params.user);
          return u ? send(200, { ok: true, user: asSlackSays(u) }) : send(200, { ok: false, error: "user_not_found" });
        }
        case "conversations.open": return send(200, { ok: true, channel: { id: `D${String(params.users).slice(1)}` } });
        case "chat.postMessage": return send(200, { ok: true, channel: params.channel, ts: `${ts++}.000100` });
        case "chat.update": return send(200, { ok: true, channel: params.channel, ts: params.ts, text: params.text });
        case "views.open": return send(200, { ok: true, view: { id: `V${randomBytes(6).toString("hex").toUpperCase()}` } });
        default: return send(200, { ok: false, error: "unknown_method" });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries({ ...SLACK_SETTINGS, ZIFFR_SLACK_API_URL: `http://127.0.0.1:${port}/api` })) { saved[k] = process.env[k]; process.env[k] = v; }
  return {
    calls,
    /** Calls of one method. */
    of: (method: string) => calls.filter((c) => c.method === method),
    /** Adds a Slack user; returns their id. */
    user: (email: string, over: Partial<FakeUser> = {}) => { const id = over.id ?? slackId("U"); users.push({ id, email, ...over }); return id; },
    /** The next `times` calls of a method fail with this error or HTTP status. */
    fail: (method: string, how: { error?: string; status?: number; retryAfter?: number }, times = 1) => { fails[method] = { ...how, times }; },
    /** A fresh Slack workspace for the next "Add to Slack", so tests never share one. */
    newTeam: () => { install = { ...install, team: { id: slackId("T"), name: "Acme" }, access_token: `xoxb-${randomBytes(12).toString("hex")}` }; return install; },
    /** What the next "Add to Slack" returns. */
    get install() { return install; },
    set install(v) { install = v; },
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    },
  };
}
