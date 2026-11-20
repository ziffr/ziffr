import "server-only";
// Usage (GLOSSARY: Usage, View Count; spec 0031): counts one open of a page for the Usage page, as a number and never
// by whom. Lives here because only the web app knows a request: a browser's prefetch and a HEAD are not opens.
import { after } from "next/server";
import { headers } from "next/headers";
import { recordView, type ViewSubject } from "@ziffr/core/usage";
import type { Actor } from "@ziffr/core/actor";

/** Whether this request opens nothing: a browser or Next prefetch, or a HEAD (marked by the middleware). */
export async function isNotAnOpen(): Promise<boolean> {
  const h = await headers();
  return h.has("next-router-prefetch") || h.get("x-ziffr-no-count") === "1" || /prefetch/i.test(`${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`);
}

/** Counts one open of a dashboard, deck or Metric the page has already loaded for this person, after the response is
 * sent. Fire and forget: a failure is swallowed inside recordView, and nothing here waits for it. Call it only once
 * the person is known to see the subject, so a refused page counts nothing. */
export async function countView(actor: Pick<Actor, "workspaceId">, subject: ViewSubject): Promise<void> {
  try {
    if (await isNotAnOpen()) return;
    after(() => recordView(actor, subject, "app"));
  } catch {
    // Counting never stops a page.
  }
}
