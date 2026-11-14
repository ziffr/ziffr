"use server";
// Access Keys (GLOSSARY: Access Key): thin calls into the core (@ziffr/core/access-keys).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as keys from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";

/** Creates a key; the secret is returned this once and never shown again. */
export async function createKey(input: { name: string; scopes: Scope[]; expiresOn: string }) {
  const r = await keys.createAccessKey(await currentActor(), { name: String(input?.name ?? ""), scopes: input?.scopes ?? [], expiresOn: String(input?.expiresOn ?? "") });
  revalidatePath("/team");
  return r.secret;
}

/** Revokes a key. */
export async function revokeKey(id: number) {
  await keys.revokeAccessKey(await currentActor(), Number(id));
  revalidatePath("/team");
}
