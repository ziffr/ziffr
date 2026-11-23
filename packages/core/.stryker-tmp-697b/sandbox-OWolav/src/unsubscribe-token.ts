// @ts-nocheck
// Signed one-click links that work with no sign-in (RFC 8058): the usage digest's (usage-digest-token.ts) and the
// invitation stop link's (invitation-stop.ts) are made here. A token carries one subject and an HMAC-SHA256 over a label
// and that subject, under a key derived (HKDF) from ZIFFR_SECRETS_KEY, or from ZIFFR_JOB_SECRET where there is no secrets
// key, so a label's tokens never validate as another's and never share bytes with what seals other things. It names one
// subject and one use; it never expires, because stopping a mail is always safe; it opens nothing and reveals nothing
// but its own validity. Nothing is stored for it.
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { previousSecretsKey, secretsKey } from "./secrets";

type Env = Record<string, string | undefined>;

/** The signing keys in effect for a label, newest first: the secrets key, its previous one (so links survive a change of
 * key), then, only where neither is set, the job secret (always set where the clock runs). Empty when none is set: no
 * link can then be made or checked. */
function keys(label: string, env: Env): Buffer[] {
  const roots: Buffer[] = [];
  const current = secretsKey(env);
  if (current) roots.push(current);
  const previous = previousSecretsKey(env);
  if (previous) roots.push(previous);
  // The job secret is the least guarded secret (the clock and any outside scheduler hold it): it signs only where no
  // secrets key is set, so with one set, whoever holds the job secret cannot make a token.
  const job = env.ZIFFR_JOB_SECRET;
  if (!roots.length && job && job.length >= 32) roots.push(Buffer.from(job, "utf8"));
  return roots.map((r) => Buffer.from(hkdfSync("sha256", r, Buffer.alloc(0), label, 32)));
}

/** A signer for one label: which subjects are allowed (a shape check, so nothing odd is ever signed or accepted). */
export function unsubscribeSigner(label: string, subject: RegExp, maxSubjectBytes: number) {
  const token = new RegExp(`^[A-Za-z0-9_-]{1,${Math.ceil((maxSubjectBytes * 4) / 3) + 2}}\\.[A-Za-z0-9_-]{43}$`);
  const mac = (key: Buffer, s: string) => createHmac("sha256", key).update(`${label}\0${s}`).digest();
  return {
    /** Whether a link can be signed here at all. */
    available: (env: Env = process.env): boolean => keys(label, env).length > 0,
    /** The token for a subject, or null when this Installation has no key to sign with or the subject has a wrong shape. */
    sign(s: string, env: Env = process.env): string | null {
      const [key] = keys(label, env);
      if (!key || !subject.test(s)) return null;
      return `${Buffer.from(s, "utf8").toString("base64url")}.${mac(key, s).toString("base64url")}`;
    },
    /** The subject a token was signed for, or null for anything else: wrong shape, wrong signature, another label. Compared in constant time. */
    verify(t: unknown, env: Env = process.env): string | null {
      if (typeof t !== "string" || !token.test(t)) return null;
      const [who, sig] = t.split(".");
      const s = Buffer.from(who, "base64url").toString("utf8");
      if (!subject.test(s) || Buffer.from(s, "utf8").toString("base64url") !== who) return null;
      const given = Buffer.from(sig, "base64url");
      const ok = keys(label, env).some((key) => {
        const want = mac(key, s);
        return given.length === want.length && timingSafeEqual(given, want);
      });
      return ok ? s : null;
    },
  };
}
