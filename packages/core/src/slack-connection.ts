// Connecting Slack (spec 0007, ticket #101; GLOSSARY: Connector, Workspace, Workspace Role). An Owner or Admin connects
// one Slack workspace with "Add to Slack" (OAuth v2) and can disconnect it. The bot token is sealed before it is
// stored (secrets.ts) and only the core's Slack sending opens it: no loader returns it, no page sees it.
import { randomBytes } from "node:crypto";
import { assertCan, Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { openSecretRotating, sealSecret } from "./secrets";
import { callSlack, slackApiBase, slackEnabled, SlackError } from "./slack-api";
import { DEMO_WORKSPACE_ID } from "./team";

/** The bot scopes the Slack app asks for: post, open a direct message, read direct messages, find people by address. */
export const SLACK_SCOPES = ["chat:write", "im:write", "im:history", "users:read", "users:read.email"];
/** How long "Add to Slack" may take, from the click to Slack sending the person back. */
const STATE_MINUTES = 10;

/** The connected Slack workspace as a page may show it: its name and when, never its token. */
export type SlackConnectionView = { enabled: boolean; canManage: boolean; team: { name: string; connectedAt: string } | null };

/** The bot of a workspace's connected Slack workspace, with its token opened. Only for the core's Slack code; null
 * when nothing is connected, it was disconnected, or the token does not open (another ZIFFR_SECRETS_KEY). */
export type SlackBot = { workspaceId: string; teamId: string; appId: string; botUserId: string; token: string };

const sealContext = (workspaceId: string) => `slack-bot:${workspaceId}`;
const redirectUri = () => `${String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "")}/api/slack/oauth`;

function mayManage(actor: Actor) {
  assertCan(actor, "manage-members");
  // The demo is shared by every visitor: it never reaches a real Slack workspace.
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo does not connect to Slack.");
}

/** Starts "Add to Slack" for an Owner or Admin: a one-time state bound to them and their workspace, and the address
 * at Slack to send them to. */
export async function startSlackInstall(actor: Actor): Promise<string> {
  mayManage(actor);
  if (!slackEnabled()) throw new Error("Slack is not set up for this Ziffr.");
  const state = randomBytes(24).toString("base64url");
  // An abandoned attempt leaves nothing usable behind for long.
  await db().from("slack_install_states").delete().lt("created_at", new Date(Date.now() - STATE_MINUTES * 60_000).toISOString());
  const { error } = await db().from("slack_install_states").insert({ state, workspace_id: actor.workspaceId, person_id: actor.personId });
  if (error) throw new Error("Slack could not be started.");
  const url = new URL(`${new URL(slackApiBase()).origin}/oauth/v2/authorize`);
  url.searchParams.set("client_id", String(process.env.ZIFFR_SLACK_CLIENT_ID));
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
  if (!slackEnabled()) return "refused";
  const state = String(input.state ?? "");
  const code = String(input.code ?? "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(state) || !/^[A-Za-z0-9._-]{10,300}$/.test(code)) return "refused";
  // Taken and removed in one step: a state works once, even with two callbacks at the same moment.
  const { data: taken } = await db().from("slack_install_states").delete().eq("state", state).select("workspace_id, person_id, created_at");
  const s = taken?.[0];
  if (!s || s.workspace_id !== actor.workspaceId || s.person_id !== actor.personId) return "refused";
  if (Date.now() - new Date(s.created_at).getTime() > STATE_MINUTES * 60_000) return "refused";
  let r: Record<string, unknown>;
  try {
    r = await callSlack("oauth.v2.access", { client_id: process.env.ZIFFR_SLACK_CLIENT_ID, client_secret: process.env.ZIFFR_SLACK_CLIENT_SECRET, code, redirect_uri: redirectUri() });
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
    app_id: appId, bot_user_id: botUserId, bot_token: sealSecret(token, sealContext(actor.workspaceId)), scopes: String(r.scope ?? "").slice(0, 500),
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
  const bot = await slackBot(actor.workspaceId);
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
  return { enabled: slackEnabled() && actor.workspaceId !== DEMO_WORKSPACE_ID, canManage, team: data ? { name: data.team_name, connectedAt: data.installed_at } : null };
}

/** The workspace's connected bot with its token, for the core's Slack code only. */
export async function slackBot(workspaceId: string): Promise<SlackBot | null> {
  if (workspaceId === DEMO_WORKSPACE_ID || !slackEnabled()) return null;
  const { data } = await db().from("slack_installations").select("team_id, app_id, bot_user_id, bot_token").eq("workspace_id", workspaceId).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  const opened = openSecretRotating(data.bot_token, sealContext(workspaceId));
  const token = opened?.plain ?? null;
  // Sealed under the key being retired: seal it again under the current one, so that key can go (spec 0009).
  if (opened?.stale) await db().from("slack_installations").update({ bot_token: sealSecret(opened.plain, sealContext(workspaceId)) }).eq("workspace_id", workspaceId).eq("bot_token", data.bot_token);
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
