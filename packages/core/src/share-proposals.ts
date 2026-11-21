// Share Proposals (ticket #538, GLOSSARY: Share Proposal): an assistant or program only *prepares* a share; the person
// the key acts for confirms it in the app with their own sign-in. A proposal shares nothing and sends nothing. Only
// confirming runs the core's own operations (make a View Link, give a Share) and, for a View Link, emails the recipient.
//
// Rules, each checked here and not in a screen: a proposal names only what its proposer may share themselves (checked
// again when it is confirmed, since things change in seven days); only the proposer decides it, and only as a person, never
// with a key, whatever its scopes (an assistant could be talked into confirming its own proposal); it can be confirmed
// for seven days; a person has at most MAX_OPEN_PROPOSALS open; the recipient and the message are returned in plain
// words for the confirm screen; the Audit Log names the connection that proposed and the person who decided, never the
// message. Never for people management or approvals.
import { effectiveLimit } from "./limits";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { audit } from "./audit-log";
import { workspaceLook } from "./workspace-look";
import { brandedParts, headerSafe, sentByLine, isAddress, mailboxKey, mailOn, sendMail, type MailTransport } from "./mail";
import { linkTo } from "./deliveries";
import { refuseInDemo } from "./demo";
import { assertNotTrial } from "./trials";
import { visibleDashboards } from "./access";
import { openNames } from "./sealed-columns";
import { assertMembersIn, share, shareWithGroup } from "./sharing";
import { createHash } from "node:crypto";
import { createViewLink, endDate, previewViewLink, viewForLink, type ViewPayload } from "./view-links";

/** Days a Share Proposal can be confirmed. */
export const PROPOSAL_DAYS = 7;
/** Open Share Proposals one person may have at once; a proposal made beyond it is refused until one is decided or expires. */
export const MAX_OPEN_PROPOSALS = 10;
/** The longest message that goes with a View Link, in characters. */
export const PROPOSAL_MESSAGE_MAX = 500;
/** View Link emails one person's confirmations may send in 24 hours, and to one address: a View Link email reaches a stranger. */
export const PROPOSAL_EMAILS_PER_PERSON = 20;
/** View Link emails to one address (spelled alike) in 24 hours. */
export const PROPOSAL_EMAILS_PER_ADDRESS = 3;
/** Share Proposals one person may make in 24 hours (the database holds it too). */
export const PROPOSALS_PER_DAY = 30;

const DAY = 86400000;

/** What a person is shown of a Share Proposal. `recipient` is plain text: an address, or the name of a person or Group. */
export type ShareProposal = {
  id: number;
  status: "open" | "confirmed" | "declined" | "expired";
  kind: "view_link" | "share";
  dashboard: { id: number; name: string };
  snapshot: { id: number; label: string } | null;
  /** A View Link that keeps the numbers as they are when it is made (a Snapshot's link always does) or shows them live. */
  frozen: boolean;
  recipient: { type: "email" | "person" | "group"; label: string };
  endsOn: string | null;
  message: string | null;
  createdAt: string;
  expiresAt: string;
  /** The name of the connection or key that proposed it, or null once it is gone. */
  proposedBy: string | null;
  /** For a confirmed View Link: whether its email went out. */
  emailState: "sent" | "failed" | "not_sent" | null;
};

/** The one place a person confirms or declines a proposal, as a path in the app. */
export const proposalPath = (id: number) => `/actions/share/${id}`;

type Row = {
  id: number; workspace_id: string; proposer_id: string; access_key_id: number | null; kind: "view_link" | "share"; dashboard_id: number; snapshot_id: number | null; frozen: boolean;
  recipient_email: string | null; recipient_key: string | null; recipient_person_id: string | null; recipient_group_id: number | null; ends_on: string | null; message: string | null;
  status: "open" | "confirmed" | "declined"; created_at: string; expires_at: string; email_state: "sent" | "failed" | "not_sent" | null;
};
const COLUMNS = "id, workspace_id, proposer_id, access_key_id, kind, dashboard_id, snapshot_id, frozen, recipient_email, recipient_key, recipient_person_id, recipient_group_id, ends_on, message, status, created_at, expires_at, email_state";

/** A message as it is kept: control characters out, blank lines collapsed, at most PROPOSAL_MESSAGE_MAX characters. */
export function cleanMessage(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new Refused("The message must be text.");
  const text = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > PROPOSAL_MESSAGE_MAX) throw new Refused(`A message has at most ${PROPOSAL_MESSAGE_MAX} characters.`);
  return text || null;
}

/** The dashboard the person owns (and so may share), with its name; anything else is "not found", the same whether it exists or not. */
export async function ownDashboard(actor: Pick<Actor, "workspaceId" | "personId">, id: unknown): Promise<{ id: number; name: string }> {
  const d = Number.isInteger(id) ? (await visibleDashboards(actor.workspaceId, actor.personId)).find((x) => x.id === id) : undefined;
  if (!d || d.owner_id !== actor.personId) throw new Forbidden("That dashboard was not found.");
  return { id: d.id, name: d.name };
}

/** Everything a View Link would show, as a fingerprint of the whole payload: name, introduction, footer, theme, every widget with
 * its settings and place, the Metrics with their series and the people's names shown. The confirm page sends the one it showed;
 * confirming makes the link from a payload with that same fingerprint, so nothing changed after the person looked goes out unseen. */
export function previewFingerprint(view: ViewPayload | null): string {
  if (!view) return "";
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)])) : v;
  // `asOf` is the moment it was read, so it differs every time; everything else is what the recipient sees.
  const shown: Record<string, unknown> = { ...view };
  delete shown.asOf;
  return createHash("sha256").update(JSON.stringify(stable(shown))).digest("hex").slice(0, 32);
}

/** Refuses a Share to someone who already has access to the dashboard: confirming would replace their role, and could take
 * Editor away. */
async function assertNoShareYet(workspaceId: string, dashboardId: number, to: { person?: string | null; group?: number | null }): Promise<void> {
  let q = db().from("shares").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("object_type", "dashboard").eq("object_id", dashboardId);
  q = to.person ? q.eq("user_id", to.person) : q.eq("group_id", Number(to.group));
  const { count } = await q;
  if (count) throw new Refused("They already have access to that dashboard. Change it in Ziffr if you want to.");
}

/** Open proposals the person has, not counting those that ran out. */
async function openCount(actor: Pick<Actor, "workspaceId" | "personId">): Promise<number> {
  const { count } = await db().from("share_proposals").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("proposer_id", actor.personId).eq("status", "open").gt("expires_at", new Date().toISOString());
  return count ?? 0;
}

/** What a key asks for: a View Link to an address, or a Share to a person or a Group, to one dashboard (or one of its shown Snapshots). */
export type ProposalInput = {
  dashboard: number; snapshot?: number | null; live?: boolean;
  email?: string; person?: string; group?: number; ends?: string; message?: string | null;
};

/** Writes a proposal for the person a key acts for, after every check a confirmation makes again. Nothing is shared or sent.
 * `accessKeyId` is the connection or key that proposed it, so the Audit Log names it. Called by the API only. */
export async function createShareProposal(actor: Actor, accessKeyId: number, input: ProposalInput): Promise<{ id: number }> {
  refuseInDemo(actor);
  assertCan(actor, "share");
  const dashboard = await ownDashboard(actor, input.dashboard);
  const viewLink = input.email !== undefined || input.ends !== undefined;
  const sharing = input.person !== undefined || input.group !== undefined;
  if (viewLink === sharing) throw new Refused("Name either an email address with an end date (a View Link) or a person or a Group (a Share).");
  const row: Record<string, unknown> = { workspace_id: actor.workspaceId, proposer_id: actor.personId, access_key_id: accessKeyId, dashboard_id: dashboard.id, expires_at: new Date(Date.now() + PROPOSAL_DAYS * DAY).toISOString() };
  let recipient: string;
  if (viewLink) {
    await assertNotTrial(actor.workspaceId, "Sharing by email");
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    // The same check as sending, so a proposal is never made for an address mail cannot go to.
    if (!isAddress(email)) throw new Refused("Enter a valid email address.");
    const snapshot = input.snapshot ?? null;
    if (snapshot !== null && !Number.isInteger(snapshot)) throw new Refused("The Snapshot was not found.");
    // The preview is what the recipient would see; none means nothing to show (a Snapshot not shown yet, an empty dashboard).
    if (!(await previewViewLink(actor, dashboard.id, snapshot))) throw new Refused(snapshot === null ? "The dashboard has nothing to show yet." : "Show the Snapshot to everyone with access first, then propose a link to it.");
    Object.assign(row, { kind: "view_link", recipient_email: email, recipient_key: mailboxKey(email), ends_on: endDate(input.ends, await effectiveLimit("viewLinkDays", actor.workspaceId)), message: cleanMessage(input.message), snapshot_id: snapshot, frozen: snapshot !== null || input.live !== true });
    recipient = "email";
  } else {
    if (input.message !== undefined && input.message !== null && input.message !== "") throw new Refused("A message goes only with a View Link.");
    if ((input.person !== undefined) === (input.group !== undefined)) throw new Refused("Name one person or one Group.");
    if (input.snapshot !== undefined && input.snapshot !== null) throw new Refused("A Share gives access to the whole dashboard, not to a Snapshot.");
    if (input.person !== undefined) {
      if (typeof input.person !== "string" || input.person === actor.personId) throw new Forbidden();
      await assertMembersIn(actor, [input.person]);
      await assertNoShareYet(actor.workspaceId, dashboard.id, { person: input.person });
      Object.assign(row, { kind: "share", recipient_person_id: input.person });
    } else {
      const { data: g } = await db().from("groups").select("id").eq("id", Number(input.group)).eq("workspace_id", actor.workspaceId).maybeSingle();
      if (!g) throw new Forbidden();
      await assertNoShareYet(actor.workspaceId, dashboard.id, { group: g.id });
      Object.assign(row, { kind: "share", recipient_group_id: g.id });
    }
    recipient = "share";
  }
  if ((await openCount(actor)) >= MAX_OPEN_PROPOSALS) throw new Refused(`You have ${MAX_OPEN_PROPOSALS} Share Proposals waiting. Confirm or decline some in Ziffr first.`);
  const { data: made, error } = await db().from("share_proposals").insert(row).select("id").single();
  // The database's own limits, for requests made at the same moment.
  if (error?.code === "ZF538") throw new Refused(`You have ${MAX_OPEN_PROPOSALS} Share Proposals waiting. Confirm or decline some in Ziffr first.`);
  if (error?.code === "ZF539") throw new Refused(`At most ${PROPOSALS_PER_DAY} Share Proposals a day. Try again tomorrow.`);
  if (error || !made) throw new Error("The proposal could not be made.");
  // Never the address or the message: the log says that one was asked for, by which connection, and about what.
  await audit(actor, { kind: "share_proposal.proposed", accessKeyId, object: { type: "dashboard", id: dashboard.id, name: dashboard.name }, details: { proposal_id: made.id, how: recipient === "email" ? "view_link" : "share" } });
  return { id: made.id };
}

/** Rows as a person reads them, names opened. */
async function describe(workspaceId: string, rows: Row[]): Promise<ShareProposal[]> {
  if (!rows.length) return [];
  const proposer = rows[0].proposer_id;
  const dashboards = await visibleDashboards(workspaceId, proposer);
  const people = rows.map((r) => r.recipient_person_id).filter((p): p is string => Boolean(p));
  const groups = rows.map((r) => r.recipient_group_id).filter((g): g is number => g !== null);
  const keys = rows.map((r) => r.access_key_id).filter((k): k is number => k !== null);
  const snapshots = rows.map((r) => r.snapshot_id).filter((k): k is number => k !== null);
  const [profiles, grp, key, snap] = await Promise.all([
    people.length ? db().from("profiles").select("id, name").in("id", people).then((r) => openNames(workspaceId, r.data ?? [])) : [],
    groups.length ? db().from("groups").select("id, name").eq("workspace_id", workspaceId).in("id", groups).then((r) => r.data ?? []) : [],
    keys.length ? db().from("access_keys").select("id, name").eq("workspace_id", workspaceId).in("id", keys).then((r) => r.data ?? []) : [],
    snapshots.length ? db().from("dashboard_snapshots").select("id, label").eq("workspace_id", workspaceId).in("id", snapshots).then((r) => r.data ?? []) : [],
  ]);
  const now = new Date().toISOString();
  return rows.map((r): ShareProposal => ({
    id: r.id, kind: r.kind, status: r.status === "open" && r.expires_at <= now ? "expired" : r.status,
    dashboard: { id: r.dashboard_id, name: dashboards.find((d) => d.id === r.dashboard_id)?.name ?? "A dashboard" },
    snapshot: r.snapshot_id === null ? null : { id: r.snapshot_id, label: String(snap.find((s) => s.id === r.snapshot_id)?.label ?? "") },
    frozen: r.frozen,
    recipient: r.recipient_email ? { type: "email", label: r.recipient_email } : r.recipient_group_id !== null
      ? { type: "group", label: String(grp.find((g) => g.id === r.recipient_group_id)?.name ?? "A Group") }
      : { type: "person", label: String(profiles.find((p) => p.id === r.recipient_person_id)?.name ?? "A person") },
    endsOn: r.ends_on, message: r.message, createdAt: r.created_at, expiresAt: r.expires_at,
    proposedBy: r.access_key_id === null ? null : (key.find((k) => k.id === r.access_key_id)?.name as string | undefined) ?? null,
    emailState: r.email_state,
  }));
}

/** The person's own Share Proposals that wait for them, oldest first (those that ran out are not listed). */
export async function listShareProposals(actor: Actor): Promise<ShareProposal[]> {
  const { data } = await db().from("share_proposals").select(COLUMNS).eq("workspace_id", actor.workspaceId).eq("proposer_id", actor.personId).eq("status", "open").gt("expires_at", new Date().toISOString()).order("id");
  return describe(actor.workspaceId, (data ?? []) as Row[]);
}

/** One of the person's own Share Proposals in any state; someone else's, or one of another Workspace, is not found (null). */
export async function getShareProposal(actor: Actor, id: number): Promise<ShareProposal | null> {
  if (!Number.isInteger(id)) return null;
  const row = await mine(actor, id);
  return row ? (await describe(actor.workspaceId, [row]))[0] : null;
}

async function mine(actor: Actor, id: number): Promise<Row | null> {
  const { data } = await db().from("share_proposals").select(COLUMNS).eq("id", id).eq("workspace_id", actor.workspaceId).eq("proposer_id", actor.personId).maybeSingle();
  return (data as Row | null) ?? null;
}

/** What the recipient of a View Link proposal would see, to look at before confirming; null for a Share, or when it is decided. */
export async function previewShareProposal(actor: Actor, id: number): Promise<ViewPayload | null> {
  const row = Number.isInteger(id) ? await mine(actor, id) : null;
  if (!row || row.kind !== "view_link" || row.status !== "open") return null;
  const view = await previewViewLink(actor, row.dashboard_id, row.snapshot_id);
  // A link made from a proposal shows no names (ticket #590): the preview is what its recipient will see.
  return view && viewForLink(view, actor.workspaceId, false);
}

/** Refuses a key: deciding is a person's act, whatever scopes an assistant holds. */
function onlyAPerson(actor: Actor): void {
  if (actor.key) throw new Forbidden("A Share Proposal is confirmed by a person in Ziffr, never through a key.");
}

/** Takes an open proposal that has not run out, once: the one claim that lets a confirmation or a decline go on. */
async function claim(actor: Actor, id: number, status: "confirmed" | "declined"): Promise<Row> {
  const row = Number.isInteger(id) ? await mine(actor, id) : null;
  if (!row) throw new Forbidden();
  if (row.status !== "open") throw new Refused(row.status === "confirmed" ? "This Share Proposal was already confirmed." : "This Share Proposal was already declined.");
  if (row.expires_at <= new Date().toISOString()) throw new Refused(`This Share Proposal ran out after ${PROPOSAL_DAYS} days. Ask for it again.`);
  const { data } = await db().from("share_proposals").update({ status, decided_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId).eq("status", "open").gt("expires_at", new Date().toISOString()).select("id");
  if (!data?.length) throw new Refused("This Share Proposal was just decided.");
  return row;
}

/** Whether a View Link to the proposal's dashboard was made by the person since the proposal was claimed. */
async function linkMadeSince(actor: Actor, row: Row, since: string): Promise<boolean> {
  if (row.kind !== "view_link") return false;
  const { count } = await db().from("view_links").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("object_id", row.dashboard_id).eq("created_by", actor.personId).gte("created_at", since);
  return Boolean(count);
}

/** Why a confirmation is refused when what would go out is no longer what the person looked at. */
const CHANGED = "The dashboard changed since you looked at it. Look at it again, then confirm.";

/** Hands a claimed proposal back as open again, when what it was to do failed. */
async function release(actor: Actor, id: number): Promise<void> {
  await db().from("share_proposals").update({ status: "open", decided_at: null }).eq("id", id).eq("workspace_id", actor.workspaceId).eq("status", "confirmed");
}

/** The name of the connection that proposed, for the Audit Log. */
async function connectionName(row: Row): Promise<string | null> {
  if (row.access_key_id === null) return null;
  const { data } = await db().from("access_keys").select("name").eq("id", row.access_key_id).eq("workspace_id", row.workspace_id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Names people chose go in the body inside quotes after fixed text, on one line, never in the subject. */
const named = (s: string) => headerSafe(s).replace(/[“”"«»„]/g, "'").slice(0, 80);

/** The email a recipient gets with the link. The sender's words are quoted and said to be theirs. */
export function viewLinkEmail(o: { sender: string; dashboard: string; url: string; endsOn: string; message: string | null }): { subject: string; text: string } {
  const lines = ["Hi,", "", `“${named(o.sender)}” shared “${named(o.dashboard)}” with you on Ziffr.`, "", `Open it here: ${o.url}`, "", `The link works until ${o.endsOn}.`];
  if (o.message) lines.push("", `Their message:`, ...o.message.split("\n").map((l) => `> ${l}`));
  lines.push("", "The names and the message above were written by the sender, not by Ziffr. If you did not expect this, you can ignore it.");
  return { subject: "Numbers were shared with you on Ziffr", text: lines.join("\n") };
}

/** Confirms a proposal as the person themselves: makes the View Link or gives the Share through the core's own operations,
 * which check once more that they own it and may share it, then emails the recipient of a View Link. Never through a key.
 * `seen` is the fingerprint of what the person was shown (previewFingerprint); a View Link is made only if it is still what would go out.
 * Returns what happened; the link's address is given so the person can send it themselves when the email could not go. */
export async function confirmShareProposal(actor: Actor, id: number, seen: string | null, transport?: MailTransport): Promise<{ kind: "view_link" | "share"; emailState: "sent" | "failed" | null; linkPath: string | null }> {
  onlyAPerson(actor);
  refuseInDemo(actor);
  assertCan(actor, "share");
  const peek = Number.isInteger(id) ? await mine(actor, id) : null;
  if (!peek) throw new Forbidden();
  // An assistant that was disconnected prepared nothing the person should still act on without asking again.
  const { data: key } = peek.access_key_id === null ? { data: null } : await db().from("access_keys").select("revoked_at").eq("id", peek.access_key_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!key || key.revoked_at) throw new Refused("The assistant or program that prepared this is no longer connected. Decline it, and ask again if you still want it.");
  if (peek.kind === "share") await assertNoShareYet(actor.workspaceId, peek.dashboard_id, { person: peek.recipient_person_id, group: peek.recipient_group_id });
  if (peek.kind === "view_link") {
    if (!seen) throw new Refused(CHANGED);
    await assertNotTrial(actor.workspaceId, "Sharing by email");
    if (!(await mailOn())) throw new Refused("Email is not set up on this Ziffr, so the recipient cannot be told. Make the View Link yourself on the dashboard and send it.");
    await assertEmailLimits(actor, peek.recipient_key ?? "");
  }
  const row = await claim(actor, id, "confirmed");
  const claimedAt = new Date().toISOString();
  const dashboard = await ownDashboard(actor, row.dashboard_id).catch(async (e) => { await release(actor, id); throw e; });
  // Once the View Link exists the proposal stays confirmed whatever follows, so that it cannot be confirmed again into a second link.
  let made = false;
  try {
    if (row.kind === "share") {
      if (row.recipient_person_id) await share(actor, "dashboard", row.dashboard_id, row.recipient_person_id, "viewer");
      else await shareWithGroup(actor, "dashboard", row.dashboard_id, Number(row.recipient_group_id), "viewer");
      made = true;
      await audit(actor, { kind: "share_proposal.confirmed", object: { type: "dashboard", id: dashboard.id, name: dashboard.name }, details: { proposal_id: id, how: "share", proposed_through: await connectionName(row) } });
      return { kind: "share", emailState: null, linkPath: null };
    }
    // Read once, after the claim: this payload is compared with what the person saw and is the one the link is made from, so a
    // change made meanwhile cannot slip in. (A Snapshot's content does not change; it is compared right before it is read again.)
    const view = await previewViewLink(actor, row.dashboard_id, row.snapshot_id);
    // The person looked at the preview without names (previewShareProposal), so that is what is compared.
    if (previewFingerprint(view && await viewForLink(view, actor.workspaceId, false)) !== seen) throw new Refused(CHANGED);
    const token = await createViewLink(actor, "dashboard", row.dashboard_id, { label: `Shared by email (proposal ${id})`, expires: String(row.ends_on), frozen: row.frozen && row.snapshot_id === null, snapshotId: row.snapshot_id }, { view: row.snapshot_id === null ? view ?? undefined : undefined });
    made = true;
    const { data: link } = await db().from("view_links").select("id").eq("token", token).eq("workspace_id", actor.workspaceId).maybeSingle();
    const { data: who } = await db().from("profiles").select("id, name, email").eq("id", actor.personId).maybeSingle();
    const sender = (await openNames(actor.workspaceId, who ? [who] : []))[0]?.name as string | undefined;
    let emailState: "sent" | "failed" = "sent";
    try {
      const by = { name: named(sender ?? "someone"), email: (who as { email?: string | null } | null)?.email, did: "shared a dashboard with you from" };
      const mail = viewLinkEmail({ sender: sender ?? "someone", dashboard: dashboard.name, url: linkTo(`/v/${token}`), endsOn: String(row.ends_on), message: row.message });
      // Ziffr's own line about who is behind it, in the plain text and the HTML alike.
      const text = `${mail.text}\n\n${sentByLine(by, (await workspaceLook(actor.workspaceId)).name)}`;
      await sendMail({ to: String(row.recipient_email), subject: mail.subject, text, ...(await brandedParts(actor.workspaceId, { text: mail.text }, by)) }, transport);
    } catch {
      emailState = "failed";
    }
    await db().from("share_proposals").update({ view_link_id: link?.id ?? null, email_state: emailState }).eq("id", id);
    await audit(actor, { kind: "share_proposal.confirmed", object: { type: "dashboard", id: dashboard.id, name: dashboard.name }, details: { proposal_id: id, how: "view_link", link_id: link?.id ?? null, email: emailState, proposed_through: await connectionName(row) } });
    return { kind: "view_link", emailState, linkPath: `/v/${token}` };
  } catch (e) {
    // Nothing was made when the core refused (the dashboard changed hands, a Metric is no longer seen): the proposal stays open.
    // A View Link that was made before the failure (its record may have failed after) is not made again: the proposal stays confirmed.
    if (!made && !(await linkMadeSince(actor, row, claimedAt))) await release(actor, id);
    throw e;
  }
}

/** Counts the View Link emails already sent in 24 hours by this person, and to this address in every Workspace (by its one
 * spelling), so that no number of Workspaces gets past the limit; confirmations at the very same moment may overshoot by one. */
async function assertEmailLimits(actor: Actor, addressKey: string): Promise<void> {
  const since = new Date(Date.now() - DAY).toISOString();
  const [{ count: mine }, { count: toAddress }] = await Promise.all([
    db().from("share_proposals").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("proposer_id", actor.personId).eq("kind", "view_link").eq("status", "confirmed").gte("decided_at", since),
    db().from("share_proposals").select("id", { count: "exact", head: true }).eq("recipient_key", addressKey).eq("kind", "view_link").eq("status", "confirmed").gte("decided_at", since),
  ]);
  if ((mine ?? 0) >= PROPOSAL_EMAILS_PER_PERSON) throw new Refused("You have shared a lot by email today. Try again tomorrow.");
  if ((toAddress ?? 0) >= PROPOSAL_EMAILS_PER_ADDRESS) throw new Refused("That address was sent links several times today. Try again tomorrow.");
}

/** Declines a proposal as the person themselves; nothing was shared or sent. Never through a key. */
export async function declineShareProposal(actor: Actor, id: number): Promise<void> {
  onlyAPerson(actor);
  refuseInDemo(actor);
  const row = await claim(actor, id, "declined");
  const dashboard = await ownDashboard(actor, row.dashboard_id).catch(() => ({ id: row.dashboard_id, name: "A dashboard" }));
  await audit(actor, { kind: "share_proposal.declined", object: { type: "dashboard", id: dashboard.id, name: dashboard.name }, details: { proposal_id: id, proposed_through: await connectionName(row) } });
}
