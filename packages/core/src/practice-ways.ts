// "Send to yourself" in a Practice Workspace (spec 0063, #1271; GLOSSARY: Practice Workspace, Connector): its person
// switches email, Slack and Telegram on for themself, each by itself and off by default. Switching one on records the one
// place it may reach (the sign-in address verified then; the chat account linked first afterwards), and everything that
// sends compares where a message would really go with it (practice.ts).
// SECURITY: only the person the Workspace was made for, signed in themself (never a key), while an Installation Admin.
// Switching off ends the connection and holds whatever still waits; nothing held is ever sent later.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { assertInstallationAdmin } from "./installation-admins";
import { addressIn, mailboxKey, mailOn } from "./mail";
import { asDestination, PRACTICE_HELD, PracticeRefused, practiceFor, SELF_WAYS, verifiedSignInAddress, type SelfWay } from "./practice";
import { slackOn } from "./slack-api";
import { disconnectSlack } from "./slack-connection";
import { telegramOn } from "./telegram-api";

/** How one way to oneself stands. */
export type PracticeWayState = {
  way: SelfWay;
  on: boolean;
  /** For email, the address it reaches. For a chat way, null. */
  address: string | null;
  /** For a chat way that is on: whether an account was linked and recorded, and whether the one linked now is it. */
  account: "none" | "recorded" | "changed" | null;
  /** Why it cannot be switched on, in words, or null. */
  cannot: string | null;
};

const isWay = (way: unknown): way is SelfWay => (SELF_WAYS as readonly string[]).includes(way as string);

/** Whether the actor is the person this Practice Workspace was made for, signed in themself. */
async function itsPerson(actor: Actor): Promise<boolean> {
  return !actor.key && (await practiceFor(actor.workspaceId)) === actor.personId;
}

/** The chat account the person has linked in the Workspace now, as it would be recorded, or null. */
async function linkedNow(actor: Actor, way: "slack" | "telegram"): Promise<string | null> {
  if (way === "telegram") {
    const { data } = await db().from("telegram_links").select("chat_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
    return data ? String(data.chat_id) : null;
  }
  const { data } = await db().from("slack_links").select("team_id, slack_user_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).eq("matched_by", "code").maybeSingle();
  return data ? asDestination(`${data.team_id}:${data.slack_user_id}`) : null;
}

/** Why a way cannot be switched on here, or null. */
async function cannot(actor: Actor, way: SelfWay): Promise<string | null> {
  if (way === "slack") return (await slackOn()) ? null : "Slack is not set up on this Ziffr.";
  if (way === "telegram") return (await telegramOn()) ? null : "Telegram is not set up on this Ziffr.";
  if (!(await mailOn())) return "Email is not set up on this Ziffr.";
  const verified = await verifiedSignInAddress(actor.personId);
  if (!verified) return "Your sign-in address is not verified, so Ziffr sends it nothing from here.";
  // Messages go to the address the Workspace keeps for you: the two must be one.
  return asDestination((await addressIn(actor.workspaceId, actor.personId)) ?? "") === verified ? null : "The address in your profile is not your verified sign-in address, so nothing could be sent to it.";
}

/** How the three ways stand, for the person the Practice Workspace was made for; null for anyone else and elsewhere. */
export async function practiceWays(actor: Actor): Promise<PracticeWayState[] | null> {
  if (!(await itsPerson(actor))) return null;
  const { data, error } = await db().from("practice_ways").select("way, destination").eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The ways to yourself could not be read.");
  const on = new Map((data ?? []).map((r) => [r.way as SelfWay, (r.destination as string | null) ?? null]));
  return Promise.all(SELF_WAYS.map(async (way) => {
    const recorded = on.get(way);
    const isOn = on.has(way);
    let account: PracticeWayState["account"] = null;
    if (isOn && way !== "email") {
      const now = await linkedNow(actor, way);
      account = !recorded || !now ? "none" : now === recorded ? "recorded" : "changed";
    }
    return { way, on: isOn, address: way === "email" ? recorded ?? null : null, account, cannot: isOn ? null : await cannot(actor, way) };
  }));
}

/** Holds in the Outbox what waits to go by a way. Nothing of it is sent when the way is switched on again. */
async function hold(workspaceId: string, way: SelfWay): Promise<void> {
  const { error } = await db().from("deliveries").update({ mail_state: "outbox", last_error: PRACTICE_HELD }).eq("workspace_id", workspaceId).eq("connector", way).eq("mail_state", "queued");
  if (error) throw new Error("What waited to be sent could not be held back.");
}

/** Switches a way off: its connection first, while it can still be ended, then the switch, then what waited. */
async function off(actor: Actor, way: SelfWay): Promise<void> {
  if (way === "slack") await disconnectSlack(actor);
  if (way === "telegram") {
    for (const table of ["telegram_link_codes", "telegram_links"]) await db().from(table).delete().eq("workspace_id", actor.workspaceId);
    await db().from("telegram_workspaces").update({ enabled: false, changed_by: actor.personId, changed_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId).eq("enabled", true);
  }
  const { error } = await db().from("practice_ways").delete().eq("workspace_id", actor.workspaceId).eq("way", way);
  if (error) throw new Error("The way could not be switched off.");
  await hold(actor.workspaceId, way);
}

/** Switches a way to oneself on or off in the actor's Practice Workspace. Switching on records where it may reach. */
export async function switchPracticeWay(actor: Actor, way: unknown, on: boolean): Promise<void> {
  refuseInDemo(actor);
  if (!isWay(way) || !(await itsPerson(actor))) throw new Forbidden("Only the person a Practice Workspace was made for switches this.");
  await assertInstallationAdmin(actor);
  if (!on) {
    await off(actor, way);
  } else {
    const why = await cannot(actor, way);
    if (why) throw new PracticeRefused(why);
    // What was held before stays held.
    await hold(actor.workspaceId, way);
    const address = way === "email" ? await verifiedSignInAddress(actor.personId) : null;
    const { error } = await db().from("practice_ways").upsert({ workspace_id: actor.workspaceId, way, destination: address, address_key: address ? mailboxKey(address) : null, switched_at: new Date().toISOString() }, { onConflict: "workspace_id,way" });
    if (error) throw new Error("The way could not be switched on.");
  }
  await audit(actor, { kind: on ? "workspace.practice_way_on" : "workspace.practice_way_off", object: { type: "workspace", id: actor.workspaceId }, details: { way } });
}

/** Switches every way off, ending its connection: before a Practice Workspace is deleted. */
export async function switchOffPracticeWays(actor: Actor): Promise<void> {
  const { data, error } = await db().from("practice_ways").select("way").eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The ways to yourself could not be read.");
  for (const r of data ?? []) await switchPracticeWay(actor, r.way, false);
}
