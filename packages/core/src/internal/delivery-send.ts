// Steps every Connector's send of a Delivery shares (GLOSSARY: Delivery, Connector): email (mail.ts), Slack
// (slack-send.ts) and Telegram (telegram-send.ts). Internal to the core: these check no Actor and no claim, so only a
// sender that has read the queued Delivery itself, and claimed it before it adds the link, calls them. The app never
// imports from core/internal (.github/scripts/app-db-access.mjs).
import { db } from "../db";

/** Stands in a Prompt's stored text for the recipient's personal form link, which is added only when it is sent. */
export const FORM_LINK = "[your personal form link]";

/** Marks a queued Delivery failed for good: what never goes out, whatever the limits. One no longer queued stays as it is. */
export async function failForGood(id: number, why: string) {
  await db().from("deliveries").update({ mail_state: "failed", last_error: why }).eq("id", id).eq("mail_state", "queued");
  return "failed" as const;
}

/** A Delivery's text with the recipient's personal form link put in where FORM_LINK stands, only as it is sent, so the
 * body the Outbox shows its sender never holds the link. Without the token, the link is the site's front page. */
export async function withFormLink(body: string, d: { workspace_id: string; form_token_id: number | null }, siteUrl: string) {
  if (!body.includes(FORM_LINK)) return body;
  const { data: token } = d.form_token_id ? await db().from("tokens").select("code").eq("id", d.form_token_id).eq("workspace_id", d.workspace_id).maybeSingle() : { data: null };
  const site = siteUrl.replace(/\/+$/, "");
  return body.split(FORM_LINK).join(token ? `${site}/submit/${token.code}` : `${site}/`);
}

