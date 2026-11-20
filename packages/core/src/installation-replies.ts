// Replies by email on the Installation Settings page (spec 0025, #198; GLOSSARY: Installation Settings, Installation
// Admin): the signing secret Ziffr makes for the inbound provider, the MX record the replies domain needs and what
// it has now, and a test that sends the admin an email with a reply address of its own and waits for the reply to
// come back signed. The test reply is no Delivery's: it touches no Workspace, Thread or value, and its address works
// once, for thirty minutes, for its admin only.
import { createHash, randomBytes } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import { db } from "./db";
import type { InboundEmail } from "./inbound-email";
import { assertInstallationAdmin, isInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { saveInstallationSettings } from "./installation-settings";
import { inboundEnabled, isAddress, replyAddress, smtpTransportWith, type MailTransport } from "./mail";
import { settingSources, settingsInEffect } from "./settings-in-effect";

/** Tests one Installation Admin may start in an hour. */
export const REPLY_TESTS_PER_HOUR = 5;
/** How long a test's reply address works. */
export const REPLY_TEST_MINUTES = 30;

/** Where the latest test stands, for the page. `fromAdmin`: the reply came from the admin's own address; `vouched`:
 * the inbound provider vouched for its sender (what ZIFFR_INBOUND_AUTHSERV_ID asks for). */
export type ReplyTestStatus =
  | { state: "none" | "waiting" | "expired"; at: string | null }
  | { state: "received"; at: string; fromAdmin: boolean; vouched: boolean; vouchingAsked: boolean };

/** What the page shows about the replies domain's MX records: those found now, or why none could be read. */
export type MxView = { domain: string; records: string[]; problem: string | null };

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** Makes a new signing secret for the inbound provider, saves it sealed and answers it this once, so the admin can
 * give it to the provider's forwarder. Refused when the server sets it; the old one stops working at once. */
export async function makeInboundSecret(actor: InstallationActor): Promise<{ secret: string }> {
  await assertInstallationAdmin(actor);
  if ((await settingSources()).ZIFFR_INBOUND_SECRET === "server") throw new Error("The signing secret is set on the server; change it there.");
  const secret = randomBytes(32).toString("hex");
  // Through the page's own save, with its checks, sealing and audit by name.
  await saveInstallationSettings(actor, "replies", { ZIFFR_INBOUND_SECRET: secret });
  return { secret };
}

/** The MX records of the replies domain as the world sees them now (at most a few seconds' wait), so an admin can
 * see whether replies would reach the provider. Installation Admins only. */
export async function inboundMx(actor: InstallationActor, lookup: (domain: string) => Promise<{ exchange: string; priority: number }[]> = resolveMx): Promise<MxView | null> {
  await assertInstallationAdmin(actor);
  const domain = String((await settingsInEffect()).ZIFFR_INBOUND_DOMAIN ?? "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  try {
    const found = await Promise.race([lookup(domain), new Promise<never>((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 4000))]);
    const records = found.sort((a, b) => a.priority - b.priority).slice(0, 10).map((r) => `${r.priority} ${String(r.exchange).replace(/[^a-z0-9.-]/gi, "").slice(0, 253)}`);
    return { domain, records, problem: records.length ? null : `${domain} has no MX record yet.` };
  } catch (e) {
    const code = String((e as { code?: string }).code ?? "");
    return { domain, records: [], problem: code === "ENODATA" || code === "ENOTFOUND" ? `${domain} has no MX record yet.` : `The MX records of ${domain} could not be read just now.` };
  }
}

/** Starts a test: emails the admin's own proven address with a reply address of the test's own, through the mail
 * settings in effect. At most REPLY_TESTS_PER_HOUR an hour; a new test ends the one before. */
export async function startReplyTest(actor: InstallationActor, transport?: MailTransport): Promise<{ to: string }> {
  await assertInstallationAdmin(actor);
  const settings = await settingsInEffect();
  if (!inboundEnabled(settings)) throw new Error("Set up mail, the domain for replies and the signing secret first.");
  const { data: me } = await db().from("profiles").select("email").eq("id", actor.personId).maybeSingle();
  const to = (me?.email as string | null) ?? null;
  if (!isAddress(to)) throw new Error("Your account has no proven email address to send the test to.");
  // The shape of a Delivery's reply token (24 random bytes), so the provider and parser treat it alike.
  const token = randomBytes(24).toString("base64url");
  const { data: id, error } = await db().rpc("make_installation_reply_test", { p_person: actor.personId, p_token_hash: hashOf(token), p_limit: REPLY_TESTS_PER_HOUR });
  // Any failure to count is a refusal.
  if (error || typeof id !== "number") throw new Error(`At most ${REPLY_TESTS_PER_HOUR} reply tests an hour. Try again later.`);
  try {
    await (transport ?? smtpTransportWith(settings))({
      to, subject: "Ziffr: test of replies by email", replyTo: replyAddress(token, settings),
      text: `This is a test from Ziffr at ${settings.ZIFFR_SITE_URL}.\n\nReply to this email with anything, such as "test". When your reply arrives, the Installation settings page says so.\n\nThe reply address works once, for ${REPLY_TEST_MINUTES} minutes.`,
    });
  } catch {
    await db().from("installation_reply_tests").update({ token_hash: null }).eq("id", id);
    throw new Error("The test email could not be sent. Try Send a test email in the Mail section first.");
  }
  await db().from("installation_reply_tests").update({ sent_at: new Date().toISOString() }).eq("id", id);
  await recordInstallationEvent(actor.personId, "setting.test_replies", "ZIFFR_INBOUND_DOMAIN");
  return { to };
}

/** Where the actor's latest test stands. Installation Admins only. */
export async function replyTestStatus(actor: InstallationActor): Promise<ReplyTestStatus> {
  await assertInstallationAdmin(actor);
  const { data: t } = await db().from("installation_reply_tests").select("created_at, sent_at, received_at, from_admin, vouched")
    .eq("person_id", actor.personId).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!t) return { state: "none", at: null };
  if (t.received_at) {
    const vouchingAsked = Boolean((await settingsInEffect()).ZIFFR_INBOUND_AUTHSERV_ID);
    return { state: "received", at: t.received_at as string, fromAdmin: Boolean(t.from_admin), vouched: Boolean(t.vouched), vouchingAsked };
  }
  if (!t.sent_at || Date.now() - new Date(t.created_at as string).getTime() > REPLY_TEST_MINUTES * 60_000) return { state: "expired", at: t.created_at as string };
  return { state: "waiting", at: t.sent_at as string };
}

/** Takes a forwarded reply to a test's address, already signed and counted by the inbound route: once, within its
 * thirty minutes, while its admin still is one. Notes only whether it came from the admin's own address and whether
 * the provider vouched for it; its text is never kept. False when the token is no test's, so the caller goes on. */
export async function takeReplyTest(token: string, email: InboundEmail): Promise<boolean> {
  const { data } = await db().from("installation_reply_tests").update({ token_hash: null, received_at: new Date().toISOString() })
    .eq("token_hash", hashOf(token)).is("received_at", null).gt("created_at", minutesAgo(REPLY_TEST_MINUTES)).select("id, person_id");
  const t = data?.[0];
  if (!t) return false;
  if (!(await isInstallationAdmin({ personId: t.person_id as string }))) return true;
  const { data: me } = await db().from("profiles").select("email").eq("id", t.person_id).maybeSingle();
  const fromAdmin = Boolean(email.from && me?.email && email.from === String(me.email).toLowerCase());
  await db().from("installation_reply_tests").update({ from_admin: fromAdmin, vouched: email.verified }).eq("id", t.id);
  return true;
}
