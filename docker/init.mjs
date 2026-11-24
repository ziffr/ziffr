// The first step of an Installation run with Docker Compose (spec 0015, GLOSSARY: Installation). Runs before every
// other service, on every start:
// - On the first start it makes the keys: the JWT secret, the anon and service role keys signed with it, the job
//   secret, ZIFFR_SECRETS_KEY and the database password. They stay in the `keys` volume from then on, so a restart or
//   an upgrade never signs anyone out or loses stored Slack tokens. A value set in .env wins over a kept one.
// - Every start it works out the rest from the settings: the public address, Auth's mail and providers, PostgREST's
//   configuration, and the address Caddy serves.
// It writes one file per service (/keys/<service>.env, read by docker/entrypoint.sh, and /keys/postgrest.conf, since
// PostgREST's image has no shell), each with only what that service needs and readable only by its user. It runs as
// root to hand each file to its user; the keys themselves (/keys/keys.json) only root reads.
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, chownSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { demoSettingsForClock } from "./clock-schedule.mjs";

const DIR = process.env.ZIFFR_KEYS_DIR || "/keys";
const env = process.env;
const set = (v) => typeof v === "string" && v.trim() !== "";

// --- Keys: made once, kept in the volume -------------------------------------------------------------------------

const keptFile = `${DIR}/keys.json`;
const kept = existsSync(keptFile) ? JSON.parse(readFileSync(keptFile, "utf8")) : {};
const random = (bytes, enc = "base64url") => randomBytes(bytes).toString(enc);
const keep = (name, make) => (kept[name] ??= make());

const jwtSecret = set(env.ZIFFR_JWT_SECRET) ? env.ZIFFR_JWT_SECRET : keep("jwtSecret", () => random(48));
if (jwtSecret.length < 32) fail("ZIFFR_JWT_SECRET must be at least 32 characters.");

/** A Supabase API key: a JWT with only a role, signed with the JWT secret (HS256), valid for ten years. */
function apiKey(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase", iat, exp: iat + 10 * 365 * 86400 })}`;
  return `${body}.${createHmac("sha256", jwtSecret).update(body).digest("base64url")}`;
}
// The API keys belong to the JWT secret they were signed with: a new secret in .env gets new keys.
if (kept.keysFor !== jwtSecret) {
  kept.anonKey = apiKey("anon");
  kept.serviceRoleKey = apiKey("service_role");
  kept.keysFor = jwtSecret;
}
const dbPassword = set(env.ZIFFR_DB_PASSWORD) ? env.ZIFFR_DB_PASSWORD : keep("dbPassword", () => random(24, "hex"));
// The roles Auth and PostgREST sign in as have passwords of their own: only `db` and `migrate` know the superuser's.
const authPassword = keep("authDbPassword", () => random(24, "hex"));
const restPassword = keep("restDbPassword", () => random(24, "hex"));
keep("jobSecret", () => random(32));
keep("secretsKey", () => randomBytes(32).toString("base64"));
// Signs Auth's calls to Ziffr's Send Email Hook (spec 0025, #198): Ziffr sends sign-in links itself, through the mail
// server in effect, also one saved on the Installation settings page.
keep("authHookSecret", () => `v1,whsec_${randomBytes(32).toString("base64")}`);

writeAtomic(keptFile, JSON.stringify(kept, null, 2), 0o600);
chownSync(keptFile, 0, 0);

// --- The public address ------------------------------------------------------------------------------------------

const domain = (env.ZIFFR_DOMAIN ?? "").trim().toLowerCase();
if (domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
  fail(`ZIFFR_DOMAIN must be a host name such as ziffr.example.com, without https:// or a path (got "${domain}").`);
}
const httpPort = env.ZIFFR_HTTP_PORT || "80";
const httpsPort = env.ZIFFR_HTTPS_PORT || "443";
const siteUrl = (set(env.ZIFFR_SITE_URL)
  ? env.ZIFFR_SITE_URL
  : domain
    ? `https://${domain}${httpsPort === "443" ? "" : `:${httpsPort}`}`
    : `http://localhost${httpPort === "80" ? "" : `:${httpPort}`}`).replace(/\/$/, "");

// --- Mail: the mail server given, or Mailpit inside the stack ------------------------------------------------------

const smtpUrl = set(env.ZIFFR_SMTP_URL) ? env.ZIFFR_SMTP_URL : "smtp://mail:1025";
let smtp;
try {
  smtp = new URL(smtpUrl);
} catch {
  fail("ZIFFR_SMTP_URL must look like smtps://user:password@smtp.example.com:465.");
}
// Without a domain the default sender still needs a dot in its domain: Ziffr only sends from an address that looks
// like one (mailEnabled), and since sign-in links go through Ziffr (#198) a bare "localhost" stopped them all.
const mailFrom = set(env.ZIFFR_MAIL_FROM) ? env.ZIFFR_MAIL_FROM : `Ziffr <ziffr@${domain || "localhost.localdomain"}>`;
const fromMatch = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(mailFrom);
const senderName = fromMatch?.[1]?.trim() || "Ziffr";
const senderAddress = fromMatch ? fromMatch[2].trim() : mailFrom.trim();

// --- Sign-in providers: the same SUPABASE_AUTH_EXTERNAL_* settings as with the Supabase CLI ------------------------

const providers = { GOOGLE: "google", AZURE: "azure", GITHUB: "github", LINKEDIN_OIDC: "linkedin_oidc" };
/** @type {Record<string, string>} */
const providerEnv = {};
for (const [key] of Object.entries(providers)) {
  const id = env[`SUPABASE_AUTH_EXTERNAL_${key}_CLIENT_ID`];
  const secret = env[`SUPABASE_AUTH_EXTERNAL_${key}_SECRET`];
  if (!set(id) || !set(secret)) continue;
  providerEnv[`GOTRUE_EXTERNAL_${key}_ENABLED`] = "true";
  providerEnv[`GOTRUE_EXTERNAL_${key}_CLIENT_ID`] = id;
  providerEnv[`GOTRUE_EXTERNAL_${key}_SECRET`] = secret;
  providerEnv[`GOTRUE_EXTERNAL_${key}_REDIRECT_URI`] = `${siteUrl}/auth/v1/callback`;
}
if (providerEnv.GOTRUE_EXTERNAL_AZURE_ENABLED) providerEnv.GOTRUE_EXTERNAL_AZURE_URL = env.SUPABASE_AUTH_EXTERNAL_AZURE_URL || "https://login.microsoftonline.com/common/v2.0";

// --- What each service reads: only what it needs, readable only by its own user -----------------------------------
// The users are set in docker/compose.yml; a service whose code is broken into finds its own settings and no others.
// Caddy, the one part reachable from outside, gets nothing here: its address comes straight from compose.yml.

const UID = { db: 0, app: 1000, migrate: 1001, auth: 1002, rest: 1003, clock: 1004 };
const jobSecret = set(env.ZIFFR_JOB_SECRET) ? env.ZIFFR_JOB_SECRET : kept.jobSecret;
const authHookSecret = set(env.ZIFFR_AUTH_HOOK_SECRET) ? env.ZIFFR_AUTH_HOOK_SECRET : kept.authHookSecret;
// The demo is offered on a laptop; on a domain only when asked for (ZIFFR_DEMO=1), as an Installation for a team
// should not let strangers in without signing in.
// A public demo and nothing else (ZIFFR_DEMO_ONLY=1): the demo is on, Auth makes no accounts, and the clock resets the
// demo every night.
const demoOnly = env.ZIFFR_DEMO_ONLY === "1";
const demo = demoOnly ? "1" : set(env.ZIFFR_DEMO) ? env.ZIFFR_DEMO : domain ? "0" : "1";
// Given in the settings file (or a demo-only Ziffr), the demo setting is the server's. So is "off" on a domain: the
// middleware reads only the environment, so a demo off there keeps the demo's cookie from passing it at all, as
// before. On a laptop the demo is only the default, which the Installation settings page may change (spec 0025).
const demoFixed = demoOnly || set(env.ZIFFR_DEMO) || demo === "0";

// The app's own settings from .env (Slack, replies by email, providers offered, the user guide…): every ZIFFR_*
// setting except those that belong to the stack, never Auth's provider secrets or the keys made here.
const STACK_ONLY = new Set(["ZIFFR_DB_PASSWORD", "ZIFFR_JWT_SECRET", "ZIFFR_DOMAIN", "ZIFFR_HTTP_PORT", "ZIFFR_HTTPS_PORT", "ZIFFR_MAIL_PORT", "ZIFFR_IMAGE", "ZIFFR_KEYS_DIR"]);
// The Usage Feed (spec 0031) runs from the clock, which gets these in its own file below; the app never reads them.
const USAGE_FEED_SETTINGS = ["ZIFFR_USAGE_KEY", "ZIFFR_USAGE_FEED_KEY", "ZIFFR_USAGE_SOURCE_URL", "ZIFFR_USAGE_FEED_URL"];
for (const k of USAGE_FEED_SETTINGS) STACK_ONLY.add(k);
const appOwn = Object.fromEntries(Object.entries(env).filter(([k, v]) => k.startsWith("ZIFFR_") && !STACK_ONLY.has(k) && set(v)));

const files = {
  app: {
    ...appOwn,
    SUPABASE_URL: "http://proxy:8000",
    SUPABASE_PUBLIC_URL: siteUrl,
    SUPABASE_ANON_KEY: kept.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: kept.serviceRoleKey,
    ZIFFR_SITE_URL: siteUrl,
    // Mailpit and a sender on the domain are only defaults (spec 0025): a mail server saved on the Installation
    // settings page wins over them, while one given in the settings file wins over the page.
    ...(set(env.ZIFFR_SMTP_URL) ? { ZIFFR_SMTP_URL: smtpUrl } : { ZIFFR_SMTP_URL_DEFAULT: smtpUrl }),
    ...(set(env.ZIFFR_MAIL_FROM) ? { ZIFFR_MAIL_FROM: mailFrom } : { ZIFFR_MAIL_FROM_DEFAULT: mailFrom }),
    ZIFFR_JOB_SECRET: jobSecret,
    ZIFFR_AUTH_HOOK_SECRET: authHookSecret,
    ZIFFR_SECRETS_KEY: set(env.ZIFFR_SECRETS_KEY) ? env.ZIFFR_SECRETS_KEY : kept.secretsKey,
    // Caddy adds one hop; another proxy in front of it (ZIFFR_SITE_URL without ZIFFR_DOMAIN) adds its own.
    ZIFFR_PROXY_HOPS: set(env.ZIFFR_PROXY_HOPS) ? env.ZIFFR_PROXY_HOPS : "1",
    ...(demoFixed ? { ZIFFR_DEMO: demo } : { ZIFFR_DEMO_DEFAULT: demo }),
  },
  migrate: {
    // No TLS inside the stack: the database is reachable only on its own network.
    ZIFFR_DB_URL: `postgresql://postgres:${encodeURIComponent(dbPassword)}@db:5432/postgres?sslmode=disable`,
    SUPABASE_URL: "http://proxy:8000",
    SUPABASE_SERVICE_ROLE_KEY: kept.serviceRoleKey,
    ZIFFR_DEMO: demo,
  },
  // The clock seeds the demo nightly and tends trials hourly wherever they are offered, from this file or the
  // Installation settings page (spec 0025); a job for something not offered answers 404 and the clock says nothing.
  // The Usage Feed is off unless both of its keys are set (then the clock starts it daily); its keys go here and nowhere else.
  clock: {
    ZIFFR_JOB_SECRET: jobSecret,
    // The clock reads only this file: without these two it would call the demo's reset nightly only (spec 0051).
    ...demoSettingsForClock(env),
    ...(set(env.ZIFFR_USAGE_KEY) && set(env.ZIFFR_USAGE_FEED_KEY) ? Object.fromEntries(USAGE_FEED_SETTINGS.filter((k) => set(env[k])).map((k) => [k, env[k]])) : {}),
  },
  // supabase/postgres: the superuser's password, which compose.yml's roles script also gives the roles Auth and
  // PostgREST sign in as. Read by the image's entrypoint, which starts as root.
  db: { POSTGRES_PASSWORD: dbPassword, PGPASSWORD: dbPassword, ZIFFR_AUTH_DB_PASSWORD: authPassword, ZIFFR_REST_DB_PASSWORD: restPassword },
  auth: {
    // Sign-in links make the account (ADR 0003), except in a public demo, where nobody gets one.
    GOTRUE_DISABLE_SIGNUP: demoOnly ? "true" : "false",
    API_EXTERNAL_URL: `${siteUrl}/auth/v1`,
    GOTRUE_DB_DATABASE_URL: `postgresql://supabase_auth_admin:${encodeURIComponent(authPassword)}@db:5432/postgres`,
    GOTRUE_SITE_URL: siteUrl,
    GOTRUE_URI_ALLOW_LIST: `${siteUrl}/auth/callback`,
    GOTRUE_JWT_SECRET: jwtSecret,
    GOTRUE_JWT_ISSUER: `${siteUrl}/auth/v1`,
    GOTRUE_MAILER_URLPATHS_CONFIRMATION: `${siteUrl}/auth/v1/verify`,
    GOTRUE_MAILER_URLPATHS_INVITE: `${siteUrl}/auth/v1/verify`,
    GOTRUE_MAILER_URLPATHS_RECOVERY: `${siteUrl}/auth/v1/verify`,
    GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: `${siteUrl}/auth/v1/verify`,
    GOTRUE_SMTP_HOST: smtp.hostname,
    GOTRUE_SMTP_PORT: smtp.port || (smtp.protocol === "smtps:" ? "465" : "587"),
    GOTRUE_SMTP_USER: decodeURIComponent(smtp.username),
    GOTRUE_SMTP_PASS: decodeURIComponent(smtp.password),
    GOTRUE_SMTP_ADMIN_EMAIL: senderAddress,
    GOTRUE_SMTP_SENDER_NAME: senderName,
    // Auth hands every email to Ziffr, which sends it with the mail server in effect (spec 0025, #198). Auth calls
    // plain http only on localhost or host.docker.internal, so the app answers to that name on a network it shares
    // with Auth alone (compose.yml): the call never leaves the stack. The SMTP settings above are Auth's fallback
    // only should the hook be switched off.
    GOTRUE_HOOK_SEND_EMAIL_ENABLED: "true",
    GOTRUE_HOOK_SEND_EMAIL_URI: "http://host.docker.internal:3000/api/auth/send-email",
    GOTRUE_HOOK_SEND_EMAIL_SECRETS: authHookSecret,
    ...providerEnv,
  },
};

// Shell lines that set each value only when the service was not given it already (.env wins).
const quote = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
for (const [service, values] of Object.entries(files)) {
  const text = Object.entries(values).map(([k, v]) => `[ -n "\${${k}:-}" ] || export ${k}=${quote(v)}`).join("\n") + "\n";
  writeOwn(`${DIR}/${service}.env`, text, UID[service]);
}

// PostgREST reads its configuration from this file (its image has no shell).
const conf = {
  "db-uri": `postgresql://authenticator:${encodeURIComponent(restPassword)}@db:5432/postgres`,
  "db-schemas": "public",
  "db-anon-role": "anon",
  "db-max-rows": "1000",
  "jwt-secret": jwtSecret,
  "server-host": "*",
  "server-port": "3000",
};
writeOwn(`${DIR}/postgrest.conf`, Object.entries(conf).map(([k, v]) => `${k} = "${String(v).replace(/["\\]/g, "\\$&")}"`).join("\n") + "\n", UID.rest);

// Where `migrate` notes that the demo was filled in.
mkdirSync(`${DIR}/state`, { recursive: true });
chownSync(`${DIR}/state`, UID.migrate, UID.migrate);
chmodSync(`${DIR}/state`, 0o700);
// Every service may look up its own file, and list nothing.
chmodSync(DIR, 0o711);
// The settings of before spec 0015's review: one file every service could read.
rmSync(`${DIR}/env`, { force: true });

if (domain && !demoOnly && !set(env.ZIFFR_SMTP_URL)) {
  console.warn(
    "Ziffr: WARNING: a domain is set but no mail server (ZIFFR_SMTP_URL). Sign-in links land in Mailpit, which " +
      "anyone with a shell on this machine can read: set a mail server before anyone else signs in.",
  );
}
console.log(`Ziffr: keys ready; reached at ${siteUrl}; mail through ${smtp.hostname}; demo ${demoOnly ? "only" : demo === "0" ? "off" : "on"}.`);

/** Writes a file only `uid` can read, in one step, so no service ever reads half of it. */
function writeOwn(file, text, uid) {
  writeFileSync(`${file}.tmp`, text, { mode: 0o400 });
  chownSync(`${file}.tmp`, uid, uid);
  renameSync(`${file}.tmp`, file);
}

function writeAtomic(file, text, mode) {
  writeFileSync(`${file}.tmp`, text, { mode });
  renameSync(`${file}.tmp`, file);
}

function fail(message) {
  console.error(`Ziffr: ${message}`);
  process.exit(1);
}
