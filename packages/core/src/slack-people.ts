// Who people are on Slack (spec 0007, ticket #102; GLOSSARY: Connector, Contact, Workspace). A Delivery by Slack goes
// only to a member or Contact of its workspace, to a Slack user of the connected Slack workspace who is neither
// deleted nor a bot. A member is found by their proven address, or by a code they send the bot themselves; a Contact
// by the address the workspace keeps for them. A stored Slack handle is never used: display names in Slack are
// neither unique nor stable, and nobody proved one.
import { randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import { db } from "./db";
import { addressIn } from "./mail";
import { callSlack, SlackError } from "./slack-api";
import { slackBot, type SlackBot } from "./slack-connection";

/** How long a link code works. */
const CODE_MINUTES = 10;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A Slack user id as Slack writes it. */
export const isSlackId = (s: unknown): s is string => typeof s === "string" && /^[A-Z0-9]{3,24}$/.test(s);

/** Who a person is on the connected Slack workspace, or why nobody: found now, or as stored when still valid. */
export type SlackMatch = { userId: string; by: "email" | "code" } | { userId: null; why: string };

/** Finds the Slack user a Delivery to this person goes to. A link they made with a code counts first; a match by
 * address counts while their address is the one it was found by; otherwise Slack is asked by address. */
export async function slackUserFor(bot: SlackBot, personId: string): Promise<SlackMatch> {
  const ws = bot.workspaceId;
  const [{ data: link }, address] = await Promise.all([
    db().from("slack_links").select("slack_user_id, matched_by, email, team_id").eq("workspace_id", ws).eq("person_id", personId).maybeSingle(),
    // Only a member or Contact of this workspace has one: anyone else is nobody here.
    addressIn(ws, personId),
  ]);
  const member = await isMember(ws, personId);
  if (link && link.team_id === bot.teamId) {
    // A code link is a member's own; a Contact has no login to make one.
    if (link.matched_by === "code" && member) return { userId: link.slack_user_id, by: "code" };
    if (link.matched_by === "email" && address && link.email === address.toLowerCase()) return { userId: link.slack_user_id, by: "email" };
  }
  if (!address) return { userId: null, why: member ? "No address to find them on Slack by." : "They are not in this workspace, or have no address." };
  let user: { id?: unknown; deleted?: unknown; is_bot?: unknown; team_id?: unknown; profile?: { email?: unknown } };
  try {
    user = (await callSlack("users.lookupByEmail", { email: address }, bot.token)).user as typeof user;
  } catch (e) {
    if (e instanceof SlackError && e.code === "users_not_found") {
      await db().from("slack_links").delete().eq("workspace_id", ws).eq("person_id", personId).eq("matched_by", "email");
      return { userId: null, why: "Nobody on the connected Slack has their address." };
    }
    throw e;
  }
  // A deactivated person or a bot is nobody to ask; someone of another Slack workspace (a shared channel's guest) is
  // not of the one this workspace connected.
  if (!user || !isSlackId(user.id) || user.deleted === true || user.is_bot === true || (user.team_id !== undefined && user.team_id !== bot.teamId)) {
    return { userId: null, why: "Nobody on the connected Slack has their address." };
  }
  if (typeof user.profile?.email === "string" && user.profile.email.toLowerCase() !== address.toLowerCase()) return { userId: null, why: "Nobody on the connected Slack has their address." };
  const row = { workspace_id: ws, person_id: personId, team_id: bot.teamId, slack_user_id: user.id, matched_by: "email", email: address.toLowerCase(), linked_at: new Date().toISOString() };
  let { error } = await db().from("slack_links").upsert(row, { onConflict: "workspace_id,person_id" });
  if (error?.code === "23505" && member) {
    // A member's own proven address outweighs a Contact's, which a member typed: a Contact found first by a member's
    // address must not keep that member's Slack account. A member or a code link holding it stays.
    const { data: holder } = await db().from("slack_links").select("person_id, matched_by").eq("workspace_id", ws).eq("slack_user_id", user.id).maybeSingle();
    if (holder && holder.matched_by === "email" && !(await isMember(ws, holder.person_id))) {
      await db().from("slack_links").delete().eq("workspace_id", ws).eq("person_id", holder.person_id);
      ({ error } = await db().from("slack_links").upsert(row, { onConflict: "workspace_id,person_id" }));
    }
  }
  // One Slack user is one person here: if someone else is already that Slack user, nobody is guessed.
  if (error?.code === "23505") return { userId: null, why: "Someone else here is that Slack user." };
  if (error) throw new Error("The Slack match could not be kept.");
  return { userId: user.id, by: "email" };
}

async function isMember(ws: string, personId: string): Promise<boolean> {
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  return Boolean(data);
}

/** The person a Slack user is in a workspace, as matched: for answers that come in by Slack. */
export async function personOfSlackUser(workspaceId: string, teamId: string, slackUserId: string): Promise<string | null> {
  if (!isSlackId(slackUserId)) return null;
  const { data } = await db().from("slack_links").select("person_id").eq("workspace_id", workspaceId).eq("team_id", teamId).eq("slack_user_id", slackUserId).maybeSingle();
  return data?.person_id ?? null;
}

/** A one-time code the actor sends the bot to link their Slack account, valid ten minutes. Members only: a Contact
 * has no login to make one. Making a new one ends the last. */
export async function startSlackLink(actor: Actor): Promise<{ code: string; minutes: number }> {
  if (!(await slackBot(actor.workspaceId))) throw new Error("Slack is not connected here.");
  // 80 random bits: nobody on the Slack workspace can guess a code that is waiting, in ten minutes or ever.
  const bytes = randomBytes(10);
  let bits = 0, value = 0, code = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { code += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  const full = `ZIF-${code}`;
  const { error } = await db().from("slack_link_codes").upsert({ code: full, workspace_id: actor.workspaceId, person_id: actor.personId, created_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The code could not be made.");
  return { code: full, minutes: CODE_MINUTES };
}

/** Links the Slack user who sent a code to the person who made it, when the code is waiting and was made in the
 * workspace connected to that Slack workspace. The Slack user is known from Slack's signed event, so this proves
 * both ends. Returns the workspace's name, or null for an unknown or old code. */
export async function linkSlackByCode(bot: SlackBot, slackUserId: string, text: string): Promise<string | null> {
  const code = /\bZIF-[A-Z2-7]{16}\b/.exec(String(text).toUpperCase())?.[0];
  if (!code || !isSlackId(slackUserId)) return null;
  // Taken and removed in one step: a code works once.
  const { data: taken } = await db().from("slack_link_codes").delete().eq("code", code).eq("workspace_id", bot.workspaceId).select("person_id, created_at");
  const c = taken?.[0];
  if (!c || Date.now() - new Date(c.created_at).getTime() > CODE_MINUTES * 60_000) return null;
  if (!(await isMember(bot.workspaceId, c.person_id))) return null;
  // That Slack user was someone else here (found by address): now they are the person who proved it.
  await db().from("slack_links").delete().eq("workspace_id", bot.workspaceId).eq("slack_user_id", slackUserId).neq("person_id", c.person_id);
  const { error } = await db().from("slack_links").upsert({ workspace_id: bot.workspaceId, person_id: c.person_id, team_id: bot.teamId, slack_user_id: slackUserId, matched_by: "code", email: null, linked_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (error) return null;
  const { data: w } = await db().from("workspaces").select("name").eq("id", bot.workspaceId).maybeSingle();
  return w?.name ?? "Ziffr";
}

/** How the actor is known on the connected Slack workspace, for their Connectors page: linked by a code, found by
 * address, or not yet. */
export async function mySlackLink(actor: Actor): Promise<"code" | "email" | null> {
  const { data } = await db().from("slack_links").select("matched_by").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return (data?.matched_by as "code" | "email" | undefined) ?? null;
}

/** Whether the actor stopped Prompts and reminders on Slack in their workspace (with the button in one of them). */
export async function slackOptedOut(actor: Actor): Promise<boolean> {
  const { data } = await db().from("slack_opt_outs").select("person_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return Boolean(data);
}

/** The actor gets Prompts and reminders on Slack again in their workspace. Only they can: it was their choice. */
export async function slackOptBackIn(actor: Actor): Promise<void> {
  await db().from("slack_opt_outs").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}

/** Forgets the actor's link to Slack in their workspace; Slack messages then find them by address again, if at all. */
export async function unlinkSlack(actor: Actor): Promise<void> {
  await db().from("slack_links").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}
