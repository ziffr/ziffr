// Storing Access Keys and Feed Keys (GLOSSARY: Access Key, Feed Key). Internal to the core: this module checks no
// Actor, so only createAccessKey (access-keys.ts) and createFeedKey (feeds.ts) call it, after their own checks of who
// may make the key, its scopes and its end. The app never imports from core/internal (.github/scripts/app-db-access.mjs).
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import type { FEED_SCOPE, Scope } from "../actor";
import { trialLimitMessage } from "../trials";

/** The stored form of a secret: its SHA-256, never the secret. */
export const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Stores a new key, an Access Key or a Feed Key, with a fresh secret of which only the hash is kept. Returns its
 * id and end, and the secret, for the caller to show once. The caller has checked who may make it. */
export async function insertKey(row: { workspace_id: string; created_by: string; feed_id?: string; name: string; scopes: Scope[] | [typeof FEED_SCOPE]; expires_on: string }) {
  // A taken prefix is all but impossible (48 random bits); one more try covers it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const prefix = randomBytes(6).toString("hex");
    const secret = `zk_${prefix}_${randomBytes(32).toString("base64url")}`;
    const { data, error } = await db().from("access_keys").insert({ ...row, prefix, secret_hash: hash(secret) }).select("id, expires_on").single();
    if (data) return { id: data.id as number, expires_on: data.expires_on as string, secret };
    // A trial's limit (spec 0021) says which one it is.
    const limit = trialLimitMessage(error?.code);
    if (limit) throw new Error(limit);
    if (error?.code !== "23505") break;
  }
  throw new Error("The key could not be created.");
}
