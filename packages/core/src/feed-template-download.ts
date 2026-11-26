// Getting an Automation Template for a Feed from Ziffr (spec 0043, ticket 5; GLOSSARY: Automation Template, Feed, Feed
// Key, Metric): an Owner or Admin picks a template, a Feed (or names a new one) and the Metrics it should fill, and
// gets the n8n workflow with this Ziffr's address already in it, a starter sheet naming the Metrics' slugs, and, if
// asked, a new Feed Key shown this once. Ziffr never runs the workflow or holds the other system's credentials.
// Security: only Owners and Admins, never through a key, never in the demo; the template is one of the list this
// repository ships (an id from the browser is matched against it, never used as a file name); every Metric must be one
// the person may change the Submitters of (addFeedToMetric checks, and refuses a Derived Metric); the Feed must be a
// live Feed of this Workspace; the address comes from the Installation, set in the file by changing the parsed
// workflow, never by editing its text. The Feed Key is never in the file: n8n keeps it in a credential. The audit
// event names the template and counts, never the file.
import sheetsFeed from "../../../docs/automations/google-sheets-feed.json";
import excelFeed from "../../../docs/automations/excel-feed.json";
import stripeFeed from "../../../docs/automations/stripe-feed.json";
import hubspotFeed from "../../../docs/automations/hubspot-feed.json";
import bigqueryFeed from "../../../docs/automations/bigquery-feed.json";
import snowflakeFeed from "../../../docs/automations/snowflake-feed.json";
import hubspotForecastFeed from "../../../docs/automations/hubspot-forecast-feed.json";
import salesforceForecastFeed from "../../../docs/automations/salesforce-forecast-feed.json";
import pipedriveForecastFeed from "../../../docs/automations/pipedrive-forecast-feed.json";
import index from "../../../docs/automations/feed-templates.json";
import { audit } from "./audit-log";
import { Forbidden, type Actor } from "./actor";
import { addFeedToMetric, assertManagesFeeds, createFeed, createFeedKey, liveFeed } from "./feeds";
import { editableMetric } from "./metrics";

/** What the picker shows of a template. */
export type FeedTemplateInfo = { id: string; label: string; reads: string; needs: string; rows: boolean };

type IndexEntry = { id: string; label: string; file: string; guide: string; reads: string; needs: string; rows?: boolean };
type Node = { name: string; parameters: { assignments?: { assignments: { name: string; value: string }[] } } };
type Workflow = { name: string; nodes: Node[] };

/** The workflows this repository ships, by file; adding a template to the index needs a line here (a test says so). */
const WORKFLOWS: Record<string, Workflow> = {
  "google-sheets-feed.json": sheetsFeed as unknown as Workflow,
  "excel-feed.json": excelFeed as unknown as Workflow,
  "stripe-feed.json": stripeFeed as unknown as Workflow,
  "hubspot-feed.json": hubspotFeed as unknown as Workflow,
  "bigquery-feed.json": bigqueryFeed as unknown as Workflow,
  "snowflake-feed.json": snowflakeFeed as unknown as Workflow,
  "hubspot-forecast-feed.json": hubspotForecastFeed as unknown as Workflow,
  "salesforce-forecast-feed.json": salesforceForecastFeed as unknown as Workflow,
  "pipedrive-forecast-feed.json": pipedriveForecastFeed as unknown as Workflow,
};
const TEMPLATES = (index as { templates: IndexEntry[] }).templates;

/** The most Metrics one download names. */
export const DOWNLOAD_METRICS_MAX = 50;

/** The templates a person may pick, from the list this repository ships. */
export function feedTemplates(): FeedTemplateInfo[] {
  return TEMPLATES.map((t) => ({ id: t.id, label: t.label, reads: t.reads, needs: t.needs, rows: t.rows === true }));
}

/** What a person asks for. `feed` is one of the Workspace's Feeds by id, or the name of a new one. */
export type TemplateDownloadInput = {
  template: string;
  /** The Metrics to fill, by id; each must be one whose Submitters the person may change. */
  metrics: number[];
  feed: { id: string } | { name: string };
  /** Make a new Feed Key and give it back, shown this once, beside the file (never in it). */
  makeKey: boolean;
};

/** What was made. `key` is the secret, shown once, or null. */
export type TemplateDownload = {
  fileName: string;
  /** The workflow, as n8n imports it. */
  workflow: string;
  /** For a template that reads rows of a sheet: the starter sheet (a header and one row per Metric), else null. */
  startSheet: string | null;
  feed: { id: string; name: string };
  key: { secret: string; expiresOn: string } | null;
  metrics: { slug: string; name: string }[];
};

/** Whether `address` is an address a workflow may send to: http or https, no spaces, quotes or end slash. */
const ADDRESS = /^https?:\/\/[^\s"'\\<>]+[^\s"'\\<>/]$/;
/** The longest slug the templates and feed-kit take; a Metric with a longer one cannot be named in a flow. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
/** A Feed Key travels in a header: over plain http only to this computer, never to a name on a network. */
const plainHttpIsLocal = (address: string) => !address.startsWith("http://") || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(address);

/** Makes the download (Owners and Admins). Everything is checked before anything is made; the Feed, its place among
 * the Metrics' Submitters and its key are made through the core's own operations, audited as any. */
export async function automationTemplateFor(actor: Actor, siteUrl: string, input: TemplateDownloadInput): Promise<TemplateDownload> {
  assertManagesFeeds(actor);
  const template = typeof input?.template === "string" ? TEMPLATES.find((t) => t.id === input.template) : undefined;
  if (!template) throw new Error("Pick one of the templates offered.");
  const workflow = WORKFLOWS[template.file];
  if (!workflow || !ADDRESS.test(siteUrl) || !plainHttpIsLocal(siteUrl)) throw new Error("This Ziffr cannot make the file; its address is not set, or is not https (set ZIFFR_SITE_URL).");
  const asked = Array.isArray(input.metrics) ? input.metrics.map(Number) : [];
  if (!asked.length || asked.length > DOWNLOAD_METRICS_MAX || asked.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(asked).size !== asked.length) {
    throw new Error(`Pick 1 to ${DOWNLOAD_METRICS_MAX} Metrics.`);
  }
  const feedInput = input.feed as { id?: unknown; name?: unknown } | null;
  if (!feedInput || (typeof feedInput.id !== "string" && typeof feedInput.name !== "string")) throw new Error("Pick a Feed, or name a new one.");

  // The Metrics first: one the person may not change, or a Derived one, stops everything before a Feed is made.
  const metrics: { id: number; slug: string; name: string }[] = [];
  for (const id of asked) {
    const m = await editableMetric(actor, id, "who submits");
    if (m.formula) throw new Error(`“${m.name}” is computed from other Metrics; it takes no values.`);
    // Checked again here, since a slug goes into a flow's settings and a starter sheet: one the templates would refuse stops everything.
    if (!SLUG.test(String(m.slug))) throw new Error(`“${m.name}” has an address too long or odd for the templates; rename it first.`);
    metrics.push({ id, slug: String(m.slug), name: String(m.name) });
  }
  let feed: { id: string; name: string };
  if (typeof feedInput.id === "string") {
    const f = await liveFeed(actor.workspaceId, feedInput.id).catch(() => { throw new Forbidden("Pick one of this Workspace's Feeds."); });
    feed = { id: f.person_id, name: f.name };
  } else {
    const name = String(feedInput.name).trim().slice(0, 120);
    const made = await createFeed(actor, name || template.label);
    feed = { id: made.id, name: (await liveFeed(actor.workspaceId, made.id)).name };
  }
  for (const m of metrics) await addFeedToMetric(actor, m.id, feed.id);

  let key: TemplateDownload["key"] = null;
  if (input.makeKey === true) {
    // A key ends within a year, the rule for every Feed Key: 364 days leaves no room for a clock that is a day out.
    const expiresOn = new Date(Date.now() + 364 * 86_400_000).toISOString().slice(0, 10);
    key = { secret: (await createFeedKey(actor, feed.id, { name: `n8n: ${template.label}`, expiresOn })).secret, expiresOn };
  }

  // The file: the template as shipped, with this Ziffr's address in its Settings node. Nothing else is changed, and
  // nothing the browser sent is written into it.
  const file = JSON.parse(JSON.stringify(workflow)) as Workflow;
  const url = file.nodes.find((n) => n.name === "Settings")?.parameters.assignments?.assignments.find((a) => a.name === "ziffrUrl");
  if (!url) throw new Error("The template has no place for the address.");
  url.value = siteUrl;

  const startSheet = template.rows === true ? ["metric,value,period", ...metrics.map((m) => `${m.slug},,`)].join("\n") + "\n" : null;
  await audit(actor, { kind: "feed.template_downloaded", object: { type: "feed", id: feed.id, name: feed.name }, details: { template: template.id, metrics: metrics.length, key: key !== null } });
  return { fileName: `ziffr-${template.id}.json`, workflow: JSON.stringify(file, null, 2) + "\n", startSheet, feed, key, metrics: metrics.map(({ slug, name }) => ({ slug, name })) };
}
