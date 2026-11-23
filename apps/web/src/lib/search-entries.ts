// The pages and commands Search offers (ticket #530; GLOSSARY: Search, Workspace Role): every page by name and a few
// plain words people use for it ("invite" finds Members and Groups), and the things to do. Pure, so both the server
// (which knows the person's role) and the browser (Toggle sidebar, Switch Workspace) match with the same rules and it is
// tested on its own. What a role may open is decided from `workspaceLinks`, the same list the menus draw.
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import { workspaceLinks } from "@/lib/settings-links";

/** A page or a command Search can lead to. `words` are the plain words that also find it. */
export type Entry = { kind: "page" | "command"; id: string; label: string; hint: string; words: string; href: string };

const page = (href: string, label: string, hint: string, words: string): Entry => ({ kind: "page", id: href, label, hint, words, href });
const command = (id: string, label: string, hint: string, words: string, href: string): Entry => ({ kind: "command", id, label, hint, words, href });

/** Every page with its plain words. A page the person's role has no link to is left out by `pageEntries`. */
const PAGES: Entry[] = [
  page("/schedule", "Schedule", "Waiting for you", "approval approve inbox actions questions tasks requests todo waiting prompt timeline asked"),
  page("/dashboards", "Dashboards", "Home", "home overview charts widgets"),
  page("/decks", "Decks", "Slides", "slides presentation present board report"),
  page("/metrics", "Metrics", "All numbers", "numbers kpi list values"),
  page("/analyze", "Analyze", "Compare and explain", "compare correlation explain chart analysis"),
  page("/themes", "Themes", "Colors and fonts", "colors colours fonts design slides branding look"),
  page("/settings/workspace", "General", "Workspace settings", "settings workspace name currency fiscal year language time zone country domain preferences"),
  page("/team", "Members and Groups", "Workspace settings", "invite people members groups roles guests team join users admin"),
  page("/connectors", "Connectors", "Workspace settings", "email slack telegram whatsapp channels delivery integration"),
  page("/connectors/outbox", "Outbox", "Connectors", "sent deliveries messages emails"),
  page("/connectors/who-gets-what", "Who gets what", "Connectors", "delivery preferences reminders questions tasks team default"),
  page("/workflows", "Workflows", "Workspace settings", "approval approvals schedule asking reminders steps close lock process"),
  page("/connectors/sources", "Sources", "Connectors", "intake prompts messages incoming replies"),
  page("/settings/packs", "Packs", "Workspace settings", "templates marketplace export import setup"),
  page("/settings/keys", "Access Keys", "Workspace settings", "api token tokens key mcp calendar link"),
  page("/settings/feeds", "Feeds", "Workspace settings", "sql import automatic programs"),
  page("/settings/webhooks", "Webhooks", "Workspace settings", "webhook callback events http notify"),
  page("/changes", "Changes", "Workspace settings", "history versions activity log recent"),
  page("/settings/workspace#size", "Size and Retention", "Workspace settings", "size retention limit limits workspace limit storage keep delete grace"),
  page("/settings/usage", "Usage", "Workspace settings", "usage tidy unused counts"),
  page("/audit", "Audit log", "Workspace settings", "security who did history export"),
  page("/settings/schedule", "My schedule", "Your settings", "schedule calendar due away week month"),
  page("/settings/profile", "Your profile", "Your settings", "settings profile name email account language"),
  page("/settings/deliveries", "Your Deliveries", "Your settings", "deliveries preferences email slack how to be asked"),
  page("/settings/alerts", "Your Alerts", "Your settings", "alerts alert notify threshold"),
  page("/settings/appearance", "Appearance", "Your settings", "appearance dark mode light theme night contrast display colours"),
  page("/settings/assistants", "Connected assistants", "Your settings", "assistant ai claude chatgpt mcp connect"),
  page("/settings/your-webhooks", "Your Webhooks", "Your settings", "personal webhook webhooks own address n8n automation tasks"),
];

/** Pages that no menu lists under the Workspace: who may open them. */
const NOT_FOR_GUESTS = new Set(["/themes", "/settings/your-webhooks"]);
/** Pages only Owners and Admins have (a section of General, so no menu link lists it). */
const ADMINS_ONLY = new Set(["/settings/workspace#size"]);
/** Pages everyone has. */
const EVERYONE = new Set(["/schedule", "/dashboards", "/decks", "/metrics", "/analyze", "/settings/schedule", "/settings/profile", "/settings/deliveries", "/settings/alerts", "/settings/appearance", "/settings/assistants"]);

/** The pages this role may open: the ones everyone has, and those the Workspace menu draws for the role. */
export function pageEntries(role: WorkspaceRoleName): Entry[] {
  const menu = new Set(workspaceLinks(role).map((l) => l.href));
  return PAGES.filter((p) => EVERYONE.has(p.id) || menu.has(p.id) || (role !== "guest" && NOT_FOR_GUESTS.has(p.id)) || ((role === "owner" || role === "admin") && ADMINS_ONLY.has(p.id)));
}

/** The things to do that this person may do: `create` makes Metrics, dashboards and decks; `invite` brings people in. */
export function commandEntries({ create, invite }: { create: boolean; invite: boolean }): Entry[] {
  return [
    ...(create ? [
      command("new-metric", "New metric", "Command", "add create metric number track", "/metrics/new"),
      command("new-dashboard", "New dashboard", "Command", "add create dashboard", "/dashboards"),
      command("new-deck", "New deck", "Command", "add create deck slides presentation", "/decks"),
      command("paste-values", "Paste values", "Command", "import csv spreadsheet excel upload add values", "/paste-values"),
    ] : []),
    ...(invite ? [command("invite", "Invite someone", "Command", "add member guest email link join people", "/team")] : []),
  ];
}

/** A word as compared: lower case, without accents. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** How well one word fits an entry: 0 the label starts with it, 1 a word of the label does, 2 the label holds it,
 * 3 one of its plain words starts with it; null when none does. */
function wordScore(e: Entry, term: string): number | null {
  const label = fold(e.label);
  if (label.startsWith(term)) return 0;
  if (label.split(/\s+/).some((w) => w.startsWith(term))) return 1;
  if (label.includes(term)) return 2;
  return fold(e.words).split(/\s+/).some((w) => w.startsWith(term)) ? 3 : null;
}

/** The entries every word of the search fits, best first (ties keep the list's order); at most `max`. */
export function matchEntries(entries: readonly Entry[], words: string, max = 6): Entry[] {
  const terms = fold(words).split(/[\s,;:]+/).filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  const scored: { e: Entry; score: number; i: number }[] = [];
  entries.forEach((e, i) => {
    let score = 0;
    for (const t of terms) {
      const s = wordScore(e, t);
      if (s === null) return;
      score += s;
    }
    scored.push({ e, score, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).slice(0, max).map((s) => s.e);
}
