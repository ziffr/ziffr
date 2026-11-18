"use server";
// The consent screen's answers (spec 0023, GLOSSARY: Access Key): thin calls into the core. The authorization
// request travels back from the page as it came, and the core checks it again from scratch: nothing the page holds
// is trusted, the workspace must be one of the person's, and the scopes and end date are a key's.
import { redirect } from "next/navigation";
import { approveConnection, denyConnection, OAuthError } from "@ziffr/core/assistant-connections";
import { actorIn } from "@/lib/viewer";
import { remoteMcpEnabled } from "@/lib/remote-mcp";

/** What the form shows after a refusal. */
export type ConsentState = { error: string | null };

/** The original request's parameters, as the page put them in the form: plain strings only, at most 8 KB. */
function requestFrom(form: FormData): Record<string, string> {
  const raw = String(form.get("request") ?? "");
  if (raw.length > 8192) throw new Error("The request is too long.");
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The request is not valid.");
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

/** Connects the assistant, or says why not; on success the browser goes back to the assistant with its code. */
export async function answerConsent(_: ConsentState, form: FormData): Promise<ConsentState> {
  if (!remoteMcpEnabled()) return { error: "Assistants cannot connect to this Ziffr." };
  let to: string;
  try {
    const request = requestFrom(form);
    if (form.get("answer") === "deny") {
      to = await denyConnection(request);
    } else {
      const actor = await actorIn(String(form.get("workspace") ?? ""));
      const scopes = form.getAll("scope").map(String).slice(0, 10);
      to = (await approveConnection(actor, request, { scopes, endsOn: String(form.get("ends_on") ?? "") })).redirect;
    }
  } catch (e) {
    return { error: e instanceof OAuthError ? e.message : (e as Error).message || "Not connected." };
  }
  // Outside the try: redirect() works by throwing.
  redirect(to);
}
