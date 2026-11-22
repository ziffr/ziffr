// Secrets at rest (spec 0007, ticket #101; GLOSSARY: Connector). A Connector's credential, such as a Slack bot token,
// is sealed with AES-256-GCM under ZIFFR_SECRETS_KEY before it is stored, with what it belongs to (a workspace id) as
// additional data: a sealed value copied to another workspace's row does not open. A database dump alone holds no
// usable token. The key can be changed (spec 0009): ZIFFR_SECRETS_KEY_PREVIOUS still opens what the old key sealed,
// and openSecretRotating says when it did, so the caller seals the secret again under the new key.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** ZIFFR_SECRETS_KEY as its 32 bytes: base64 (as `openssl rand -base64 32` prints it) or 64 hex digits. Null when
 * it is missing or not exactly 32 bytes, so nothing is sealed with a weak key. */
export function secretsKey(env: Record<string, string | undefined> = process.env, name = "ZIFFR_SECRETS_KEY"): Buffer | null {
  const raw = (env[name] ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(raw)) {
    const key = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return key.length === 32 ? key : null;
  }
  return null;
}

/** Seals a secret for one owner (`context`, such as a workspace id): "v1.<iv>.<ciphertext>.<tag>", base64url. */
export function sealSecret(plain: string, context: string, key = secretsKey()): string {
  if (!key) throw new Error("ZIFFR_SECRETS_KEY is not set.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

/** Opens a sealed secret for the same owner; null when it was sealed for another, with another key, or changed. */
export function openSecret(sealed: string, context: string, key = secretsKey()): string | null {
  const [v, iv, ct, tag] = String(sealed).split(".");
  if (!key || v !== "v1" || !iv || !ct || !tag) return null;
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  // GCM takes shorter tags too, which are easier to forge: only the full 16 bytes count.
  if (ivBytes.length !== 12 || tagBytes.length !== 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, ivBytes, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** What a Slack bot token sealed with ZIFFR_SECRETS_KEY is bound to (its Workspace); read by slack-connection.ts and by
 * the re-encryption job, which seals such a token again with the Workspace Key. */
export const slackBotContext = (workspaceId: string): string => `slack-bot:${workspaceId}`;

/** The key being retired (ZIFFR_SECRETS_KEY_PREVIOUS), read like ZIFFR_SECRETS_KEY; null when unset. */
export function previousSecretsKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  return secretsKey(env, "ZIFFR_SECRETS_KEY_PREVIOUS");
}

/** Opens a sealed secret with the current key, else the previous one. `stale` is true when only the previous key
 * opened it: the caller should seal it again with sealSecret and store that. */
export function openSecretRotating(sealed: string, context: string, keys = { current: secretsKey(), previous: previousSecretsKey() }): { plain: string; stale: boolean } | null {
  const now = openSecret(sealed, context, keys.current ?? undefined);
  if (now !== null) return { plain: now, stale: false };
  const before = keys.previous ? openSecret(sealed, context, keys.previous) : null;
  return before === null ? null : { plain: before, stale: true };
}
