// The unsubscribe link of the monthly usage digest (spec 0031, ticket #368; GLOSSARY: Usage). The link must work with
// no sign-in, so it carries a signed token: the person's id and an HMAC-SHA256 over a label and that id, under a key
// derived (HKDF) from ZIFFR_SECRETS_KEY, or from ZIFFR_JOB_SECRET where there is no secrets key, so it never shares bytes with what seals other
// things. It names one person and one use (this digest); it never expires, because stopping a mail is always safe;
// it opens nothing and reveals nothing but its own validity. Nothing is stored for it.
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { previousSecretsKey, secretsKey } from "./secrets";

const LABEL = "ziffr/usage-digest-unsubscribe/v1";
const PERSON = /^[\x21-\x7e]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/;

type Env = Record<string, string | undefined>;

/** The signing keys in effect, newest first: the secrets key, its previous one (so links survive a change of key),
 * then, only where neither is set, the job secret (always set where the clock runs). Empty when none is set: no link can then be made or checked. */
function keys(env: Env): Buffer[] {
  const roots: Buffer[] = [];
  const current = secretsKey(env);
  if (current) roots.push(current);
  const previous = previousSecretsKey(env);
  if (previous) roots.push(previous);
  // The job secret is the least guarded secret (the clock and any outside scheduler hold it): it signs only where no
  // secrets key is set, so with one set, whoever holds the job secret cannot make a token.
  const job = env.ZIFFR_JOB_SECRET;
  if (!roots.length && job && job.length >= 32) roots.push(Buffer.from(job, "utf8"));
  return roots.map((r) => Buffer.from(hkdfSync("sha256", r, Buffer.alloc(0), LABEL, 32)));
}

const mac = (key: Buffer, person: string) => createHmac("sha256", key).update(`${LABEL}\0${person}`).digest();

/** Whether a link can be signed here at all. */
export function digestTokenAvailable(env: Env = process.env): boolean {
  return keys(env).length > 0;
}

/** The token for a person's digest, or null when this Installation has no key to sign with. */
export function signDigestToken(personId: string, env: Env = process.env): string | null {
  const [key] = keys(env);
  if (!key || !PERSON.test(personId)) return null;
  return `${Buffer.from(personId, "utf8").toString("base64url")}.${mac(key, personId).toString("base64url")}`;
}

/** The person a token was signed for, or null for anything else: wrong shape, wrong signature, another label. Compared
 * in constant time. */
export function verifyDigestToken(token: unknown, env: Env = process.env): string | null {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const [who, sig] = token.split(".");
  const person = Buffer.from(who, "base64url").toString("utf8");
  if (!PERSON.test(person) || Buffer.from(person, "utf8").toString("base64url") !== who) return null;
  const given = Buffer.from(sig, "base64url");
  const ok = keys(env).some((key) => {
    const want = mac(key, person);
    return given.length === want.length && timingSafeEqual(given, want);
  });
  return ok ? person : null;
}
