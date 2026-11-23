// @ts-nocheck
// Setting up the Slack app (spec 0025, ticket #200; GLOSSARY: Installation Settings, Connector): the app manifest
// filled in for this Ziffr's address, the link that opens Slack's "Create app" with it, and the one test the page can
// make before any Slack workspace is connected: Slack's signed url_verification request to the events address. The
// check keeps a fingerprint of the signing secret it proved (a hash, never the secret), so it stops counting once that
// secret is replaced. Nothing here reaches a browser beyond the link and when the check happened.
import { createHash } from "node:crypto";
import { db } from "./db";
import type { Settings } from "./settings-in-effect";
import { slackSigningSecret } from "./slack-api";
import { SLACK_SCOPES } from "./slack-connection";

/** Where Slack's "Create app" starts with a manifest filled in (docs.slack.dev, app manifests: manifest_json). */
const CREATE_APP = "https://api.slack.com/apps?new_app=1&manifest_json=";
/** The check's row in installation_checks. */
const CHECK = "slack.events";

/** This Ziffr's address as Slack needs it: https and nothing after the host, or null when it is not one. Slack refuses
 * redirect and request addresses without https. */
export function slackSiteUrl(siteUrl: string | null | undefined): string | null {
  const s = String(siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s)) return null;
  return s;
}

/** The app manifest of docs/guides/slack.md for a Ziffr at this address: its redirect, events and interactions
 * addresses, the bot scopes Ziffr asks for, and the three events it takes. */
export function slackManifest(site: string) {
  return {
    display_information: { name: "Ziffr", description: "Asks for your numbers and brings your answers back." },
    features: {
      bot_user: { display_name: "Ziffr", always_online: true },
      app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
    },
    oauth_config: { redirect_urls: [`${site}/api/slack/oauth`], scopes: { bot: [...SLACK_SCOPES] } },
    settings: {
      event_subscriptions: { request_url: `${site}/api/slack/events`, bot_events: ["message.im", "app_uninstalled", "tokens_revoked"] },
      interactivity: { is_enabled: true, request_url: `${site}/api/slack/interactions` },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}

/** The link that opens Slack's "Create app" with the manifest for this address, or null without an https address. */
export function slackCreateAppLink(siteUrl: string | null | undefined): string | null {
  const site = slackSiteUrl(siteUrl);
  return site ? CREATE_APP + encodeURIComponent(JSON.stringify(slackManifest(site))) : null;
}

/** A fingerprint of a signing secret: enough to tell whether the check was made with the secret in effect now, of no
 * use to anyone holding it (the secret is random and long). */
const fingerprint = (secret: string) => createHash("sha256").update(`installation-check:slack-signing-secret:${secret}`).digest("hex");

/** Notes that Slack's url_verification arrived signed with this signing secret: the one the signature was checked
 * with, so a secret replaced a moment later is not credited. Called only for a request already checked to be signed;
 * a failure to note it never fails Slack's request. */
export async function noteSlackEventsChecked(signedWith: string | null): Promise<void> {
  if (!signedWith) return;
  try {
    const { error } = await db().from("installation_checks").upsert({ name: CHECK, fingerprint: fingerprint(signedWith), checked_at: new Date().toISOString() });
    if (error) console.error(`Slack: the events check could not be noted (${error.code ?? "error"})`);
  } catch {
    // Slack's answer matters more than the page's note.
  }
}

/** When Slack last checked the events address with these settings' signing secret, or null when it has not since that
 * secret was set. For the Installation Settings page, which only Installation Admins see. */
export async function slackEventsCheckedAt(settings: Settings): Promise<string | null> {
  const secret = slackSigningSecret(settings);
  if (!secret) return null;
  const { data } = await db().from("installation_checks").select("fingerprint, checked_at").eq("name", CHECK).maybeSingle();
  return data && data.fingerprint === fingerprint(secret) ? String(data.checked_at) : null;
}
