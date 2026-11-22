// Connecting Slack (spec 0007, ticket #101; GLOSSARY: Connector, Workspace, Workspace Role). An Owner or Admin connects
// one Slack workspace with "Add to Slack" (OAuth v2) and can disconnect it. The bot token is sealed before it is
// stored (secrets.ts) and only the core's Slack sending opens it: no loader returns it, no page sees it.
import { randomBytes } from "node:crypto";
import { assertCan, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { openSecretRotating, sealSecret, slackBotContext } from "./secrets";
import { isSealed, workspaceCipher } from "./workspace-keys";
import { settingsInEffect } from "./settings-in-effect";
import { callSlack, slackApiBase, slackEnabled, slackOn, SlackError } from "./slack-api";
import { DEMO_WORKSPACE_ID } from "./team";
import { refuseInDemo } from "./demo";

/** The bot scopes the Slack app asks for: post, open a direct message, read direct messages, find people by address. */
export const SLACK_SCOPES = ["chat:write", "im:write", "im:history", "users:read", "users:read.email"];
/** How long "Add to Slack" may take, from the click to Slack sending the person back. */
const STATE_MINUTES = 10;

/** The connected Slack workspace as a page may show it: its name and when, never its token. */
export type SlackConnectionView = { enabled: boolean; canManage: boolean; team: { name: string; connectedAt: string } | null };

/** The bot of a workspace's connected Slack workspace, with its token opened. Only for the core's Slack code; null
 * when nothing is connected, it was disconnected, or the token does not open (another ZIFFR_SECRETS_KEY). */
export type SlackBot = { workspaceId: string; teamId: string; appId: string; botUserId: string; token: string };

const sealContext = slackBotContext;

/** Where a Workspace's bot token is sealed with its Workspace Key (spec 0028): the token dies with the Workspace. */
const tokenAt = (workspaceId: string) => ({ table: "slack_installations", column: "bot_token", row: workspaceId.toLowerCase() });

/** A bot token sealed for its Workspace: with the Workspace Key, or with ZIFFR_SECRETS_KEY where the Workspace has
 * none (it cannot be sealed otherwise, and Slack needs ZIFFR_SECRETS_KEY anyway). */
async function sealToken(workspaceId: string, token: string): Promise<string> {
  const cipher = await workspaceCipher(workspaceId);
  return cipher.sealing ? cipher.seal(tokenAt(workspaceId), token) : sealSecret(token, sealContext(workspaceId));
}
const redirectUri = () => `${String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "")}/api/slack/oauth`;

function mayManage(actor: Actor) {
  assertCan(actor, "manage-members");
  // Before Slack is called: the demo never reaches a real Slack workspace.
  refuseInDemo(actor);
}

/** Starts "Add to Slack" for an Owner or Admin: a one-time state bound to them and their workspace, and the address
 * at Slack to send them to. */
export async function startSlackInstall(actor: Actor): Promise<string> {
  mayManage(actor);
  const settings = await settingsInEffect();
  if (!slackEnabled(settings)) throw new Error("Slack is not set up for this Ziffr.");
  const state = randomBytes(24).toString("base64url");
  // An abandoned attempt leaves nothing usable behind for long.
  await db().from("slack_install_states").delete().lt("created_at", new Date(Date.now() - STATE_MINUTES * 60_000).toISOString());
  const { error } = await db().from("slack_install_states").insert({ state, workspace_id: actor.workspaceId, person_id: actor.personId });
  if (error) throw new Error("Slack could not be started.");
  const url = new URL(`${new URL(slackApiBase()).origin}/oauth/v2/authorize`);
  url.searchParams.set("client_id", String(settings.ZIFFR_SLACK_CLIENT_ID));
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

/** What became of "Add to Slack": connected, or why not, in a word for the page. */
export type SlackInstallOutcome = "connected" | "refused" | "elsewhere" | "org_install" | "failed";

/** Finishes "Add to Slack" when Slack sends the person back. Only with the state Ziffr made, within ten minutes, once,
 * for the same person in the same workspace, who must still be an Owner or Admin there. */
export async function finishSlackInstall(actor: Actor, input: { code: string; state: string }): Promise<SlackInstallOutcome> {
  mayManage(actor);
  const settings = await settingsInEffect();
  if (!slackEnabled(settings)) return "refused";
  const state = String(input.state ?? "");
  const code = String(input.code ?? "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(state) || !/^[A-Za-z0-9._-]{10,300}$/.test(code)) return "refused";
  // Taken and removed in one step: a state works once, even with two callbacks at the same moment.
  const { data: taken } = await db().from("slack_install_states").delete().eq("state", state).select("workspace_id, person_id, created_at");
  const s = taken?.[0];
  if (!s || s.workspace_id !== actor.workspaceId || s.person_id !== actor.personId) return "refused";
  if (Date.now() - new Date(s.created_at).getTime() > STATE_MINUTES * 60_000) return "refused";
  // The token will be sealed with the Workspace Key: if that cannot be opened, no token is asked for at all, so none
  // is left working at Slack with nowhere to keep it.
  try {
    await workspaceCipher(actor.workspaceId);
  } catch {
    return "failed";
  }
  let r: Record<string, unknown>;
  try {
    r = await callSlack("oauth.v2.access", { client_id: settings.ZIFFR_SLACK_CLIENT_ID, client_secret: settings.ZIFFR_SLACK_CLIENT_SECRET, code, redirect_uri: redirectUri() });
  } catch {
    return "failed";
  }
  // An org-wide install (Enterprise Grid) spans many Slack workspaces; one Ziffr workspace talks to one.
  if (r.is_enterprise_install === true) return "org_install";
  const team = r.team as { id?: unknown; name?: unknown } | null;
  const token = typeof r.access_token === "string" ? r.access_token : "";
  const id = (v: unknown) => (typeof v === "string" && /^[A-Z0-9]{3,24}$/.test(v) ? v : null);
  const teamId = id(team?.id);
  const appId = id(r.app_id);
  const botUserId = id(r.bot_user_id);
  if (!teamId || !appId || !botUserId || !/^xoxb-[A-Za-z0-9-]{10,400}$/.test(token) || r.token_type !== "bot") return "failed";
  // One Slack workspace answers to one Ziffr workspace. Its token is the same bot token the other one holds, so it
  // is not revoked here: that would cut the other off.
  const { data: other } = await db().from("slack_installations").select("workspace_id").eq("team_id", teamId).is("revoked_at", null).neq("workspace_id", actor.workspaceId).maybeSingle();
  if (other) return "elsewhere";
  const row = {
    workspace_id: actor.workspaceId, team_id: teamId, team_name: String(team?.name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120),
    app_id: appId, bot_user_id: botUserId, bot_token: await sealToken(actor.workspaceId, token), scopes: String(r.scope ?? "").slice(0, 500),
    installed_by: actor.personId, installed_at: new Date().toISOString(), revoked_at: null,
  };
  const { error } = await db().from("slack_installations").upsert(row, { onConflict: "workspace_id" });
  if (error?.code === "23505") return "elsewhere";
  if (error) return "failed";
  // People found on another Slack workspace before are not people on this one.
  await db().from("slack_links").delete().eq("workspace_id", actor.workspaceId).neq("team_id", teamId);
  await audit(actor, { kind: "slack.connected", object: { type: "workspace", id: actor.workspaceId }, details: { slack_team: row.team_name } });
  return "connected";
}

/** Disconnects the workspace's Slack for an Owner or Admin: the token is revoked at Slack where it still works, and
 * nothing is sent or taken any more. Who was found on Slack is forgotten. */
export async function disconnectSlack(actor: Actor): Promise<void> {
  mayManage(actor);
  // A token that cannot be opened any more (its Workspace Key is gone) is not revoked at Slack, but Ziffr stops
  // using it all the same.
  const bot = await slackBot(actor.workspaceId).catch(() => null);
  if (bot) {
    try {
      await callSlack("auth.revoke", {}, bot.token);
    } catch (e) {
      // Already revoked, or Slack unreachable: Ziffr stops using it either way.
      if (!(e instanceof SlackError)) throw e;
    }
  }
  await db().from("slack_installations").update({ revoked_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId).is("revoked_at", null);
  await db().from("slack_links").delete().eq("workspace_id", actor.workspaceId);
  if (bot) await audit(actor, { kind: "slack.disconnected", object: { type: "workspace", id: actor.workspaceId } });
}

/** Whether Slack is set up, and the connected Slack workspace's name, for the Connectors page. Never the token. */
export async function slackConnection(actor: Actor): Promise<SlackConnectionView> {
  const { data } = await db().from("slack_installations").select("team_name, installed_at").eq("workspace_id", actor.workspaceId).is("revoked_at", null).maybeSingle();
  const canManage = (actor.role === "owner" || actor.role === "admin") && actor.workspaceId !== DEMO_WORKSPACE_ID;
  return { enabled: (await slackOn()) && actor.workspaceId !== DEMO_WORKSPACE_ID, canManage, team: data ? { name: data.team_name, connectedAt: data.installed_at } : null };
}

/** The workspace's connected bot with its token, for the core's Slack code only. */
export async function slackBot(workspaceId: string): Promise<SlackBot | null> {
  if (workspaceId === DEMO_WORKSPACE_ID || !(await slackOn())) return null;
  const { data } = await db().from("slack_installations").select("team_id, app_id, bot_user_id, bot_token").eq("workspace_id", workspaceId).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  let token: string | null;
  // A Workspace whose key cannot be opened has no usable bot: nothing is sent, and nothing throws.
  if (isSealed(data.bot_token)) token = await workspaceCipher(workspaceId).then((c) => c.open(tokenAt(workspaceId), data.bot_token), () => null);
  else {
    // Sealed before spec 0028 with ZIFFR_SECRETS_KEY (or its previous value): sealed again with the Workspace Key, so
    // it dies with the Workspace and the retiring key can go (spec 0009). Only if nobody changed it meanwhile.
    const opened = openSecretRotating(data.bot_token, sealContext(workspaceId));
    token = opened?.plain ?? null;
    if (opened) {
      // Sealing again is a favour: when the Workspace Key cannot be opened the token is still used as it is.
      const again = await sealToken(workspaceId, opened.plain).catch(() => data.bot_token as string);
      if (again !== data.bot_token && (isSealed(again) || opened.stale)) await db().from("slack_installations").update({ bot_token: again }).eq("workspace_id", workspaceId).eq("bot_token", data.bot_token);
    }
  }
  return token ? { workspaceId, teamId: data.team_id, appId: data.app_id, botUserId: data.bot_user_id, token } : null;
}

/** The connected bot of a Slack workspace, found by Slack's team id (for events, which name the team). */
export async function slackBotOfTeam(teamId: string): Promise<SlackBot | null> {
  if (!/^[A-Z0-9]{3,24}$/.test(String(teamId))) return null;
  const { data } = await db().from("slack_installations").select("workspace_id").eq("team_id", teamId).is("revoked_at", null).maybeSingle();
  return data ? slackBot(data.workspace_id) : null;
}

/** Ends a Slack workspace's connection because Slack said so: the app was removed, or its token revoked or refused. */
export async function slackConnectionEnded(teamId: string): Promise<void> {
  const { data } = await db().from("slack_installations").update({ revoked_at: new Date().toISOString() }).eq("team_id", String(teamId)).is("revoked_at", null).select("workspace_id");
  for (const row of data ?? []) await db().from("slack_links").delete().eq("workspace_id", row.workspace_id);
}
