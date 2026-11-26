// What Set up reads of an installed Pack, and the Workspace Limit it is held to (spec 0030, spec 0058; GLOSSARY: Pack,
// Metric Catalog, Position, Repeat, Workspace Limit).
// Security: only Owners and Admins, never through a key, never in the demo, and only an install of their own Workspace.
// The stored manifest is a document read defensively.
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { assertCan, Forbidden, type Actor } from "./actor";
import { readPlaces, type PackPlaces } from "./pack-places";
import { graceNow, limitOf, limitRefusal, limitRule, metricCount, metricsAllowed, nextGraceOn } from "./workspace-limits";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import type { Slot } from "./types";
import { safeOverview } from "./installed-pack-guides";
import type { KeptOverview } from "@ziffr/pack/comes-from";

/** A Metric Catalog entry of an install, as stored. */
export type EntryRow = { id: number; pack_key: string; name: string; description: string; unit: string; unit_position: string; format: string; decimals: number; period: string; submission_rule: string; polarity: string; target_min: number | null; target_max: number | null; sources: string[]; aggregation: string; formula: string | null; tags: string[] | null; /** What makes it a Total, as stored (pack-setup-totals.ts reads it). */ total?: unknown };
/** A Dashboard or Workflow Template of an install, as stored. */
export type TemplateRow = { id: number; kind: "dashboard" | "workflow"; pack_key: string; name: string; slots: Slot[]; body: unknown };

/** An install with what it added that is still marked as from it, by the Pack's keys. */
export type InstalledForSetup = {
  install: { id: number; name: string; version: string };
  feeds: { template: string; fills: string[] }[];
  /** Its Positions and Repeats, or null for a Pack without them. */
  places: PackPlaces | null;
  /** What it brings and where its numbers come from, or null for an install that keeps none. */
  overview: KeptOverview | null;
  entries: Map<string, EntryRow>;
  dashboards: Map<string, TemplateRow>;
  workflows: Map<string, TemplateRow>;
};

/** The count, limit, what is left and what may be made now, as the set-up form shows it. `left` is what the Size still
 * holds; `allowed` is how many may be made now at all, the room and grace of spec 0029 included. A trial's cap is a
 * limit with no Size name. The core checks again when a set-up is asked for: these numbers are only for reading. */
export type PackSetupRoom = { count: number; limit: number; label: string | null; left: number; allowed: number; graceDays: number };

/** Refuses anyone but a person who is an Owner or Admin of a Workspace that is not the demo: setting up creates Metrics
 * and sends Prompts, so no program does it. */
export function assertSetsUp(actor: Actor): void {
  if ((actor as { key?: unknown }).key) throw new Forbidden();
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set up from a Pack.");
  assertCan(actor, "create");
  refuseInDemo(actor);
}

/** An install of the actor's Workspace, or Forbidden. */
export async function installedForSetup(actor: Actor, installId: number): Promise<InstalledForSetup> {
  const ws = actor.workspaceId;
  if (!Number.isSafeInteger(installId) || installId <= 0) throw new Forbidden();
  const { data: install } = await db().from("pack_installs").select("id, version, manifest").eq("id", installId).eq("workspace_id", ws).maybeSingle();
  if (!install) throw new Forbidden();
  const [{ data: entries }, { data: templates }] = await Promise.all([
    db().from("catalog_metrics").select("id, pack_key, name, description, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, aggregation, formula, tags, total").eq("workspace_id", ws).eq("pack_install_id", installId).order("id"),
    db().from("team_templates").select("id, kind, pack_key, name, slots, body").eq("workspace_id", ws).eq("pack_install_id", installId).in("kind", ["dashboard", "workflow"]).order("id"),
  ]);
  const byKey = <T extends { pack_key: string }>(rows: T[]) => new Map(rows.filter((r) => typeof r.pack_key === "string").map((r) => [r.pack_key, r]));
  const tpl = (templates ?? []) as TemplateRow[];
  const manifest = install.manifest as { name?: unknown; feeds?: unknown; places?: unknown } | null;
  return {
    install: { id: Number(install.id), name: String(manifest?.name ?? ""), version: String(install.version) },
    feeds: feedsOf(manifest?.feeds),
    places: readPlaces(manifest?.places),
    overview: safeOverview(manifest),
    entries: byKey((entries ?? []) as EntryRow[]),
    dashboards: byKey(tpl.filter((t) => t.kind === "dashboard")),
    workflows: byKey(tpl.filter((t) => t.kind === "workflow")),
  };
}

/** The templates a Pack's manifest names, read defensively: it was checked when installed, but it is a stored document. */
function feedsOf(raw: unknown): { template: string; fills: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): { template: string; fills: string[] }[] => {
    const x = f as { template?: unknown; fills?: unknown } | null;
    return x && typeof x.template === "string" && Array.isArray(x.fills) ? [{ template: x.template, fills: x.fills.filter((k): k is string => typeof k === "string") }] : [];
  });
}

/** Why `n` more Metrics cannot be made now, in the limit's words, or null: the trial's cap, or the Workspace Limit
 * counted one Metric at a time as the database will. Checked first, so a set-up does not stop half-way. */
export async function roomFor(actor: Actor, n: number): Promise<string | null> {
  const ws = actor.workspaceId;
  const [{ data: space }, limit, count] = await Promise.all([db().from("workspaces").select("trial_ends_at, over_limit_since, last_grace_started_at").eq("id", ws).maybeSingle(), limitOf(ws), metricCount(ws)]);
  if (space?.trial_ends_at) {
    const { count: all } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    const cap = (await trialLimitsInEffect()).metrics;
    return (all ?? 0) + n > cap ? `A trial holds at most ${cap} Metrics; it has ${all ?? 0}, and this makes ${n}. Pick fewer.` : null;
  }
  if (!limit) return null;
  let since = space?.over_limit_since ? new Date(space.over_limit_since as string) : null;
  const last = space?.last_grace_started_at ? new Date(space.last_grace_started_at as string) : null;
  const now = new Date();
  const grace = await graceNow();
  for (let i = 0; i < n; i++) {
    const rule = limitRule(count + i, limit.metrics, since, now, last, grace);
    const refusal = () => limitRefusal(count + i, limit, since ? null : nextGraceOn(last, now, grace.every), grace.days);
    if (rule === "refuse") return n === 1 || i === 0 ? refusal() : `${refusal()} This makes ${n} Metrics, room is left for ${i}.`;
    if (rule === "over" && !since) since = last && now.getTime() < last.getTime() + grace.days * 86_400_000 ? last : now;
  }
  return null;
}

/** The Workspace's room for Metrics, or null when nothing limits it. `atMost` caps how many "may be made now" is
 * counted to: the most one set-up makes. */
export async function roomNow(actor: Actor, atMost: number): Promise<PackSetupRoom | null> {
  const ws = actor.workspaceId;
  const [{ data: space }, limit, count, grace] = await Promise.all([
    db().from("workspaces").select("trial_ends_at, over_limit_since, last_grace_started_at").eq("id", ws).maybeSingle(),
    limitOf(ws), metricCount(ws), graceNow(),
  ]);
  if (space?.trial_ends_at) {
    const { count: all } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    const cap = (await trialLimitsInEffect()).metrics;
    const left = Math.max(0, cap - (all ?? 0));
    return { count: all ?? 0, limit: cap, label: null, left, allowed: left, graceDays: 0 };
  }
  if (!limit) return null;
  const since = space?.over_limit_since ? new Date(space.over_limit_since as string) : null;
  const last = space?.last_grace_started_at ? new Date(space.last_grace_started_at as string) : null;
  const allowed = metricsAllowed(count, limit.metrics, since, new Date(), last, grace, atMost);
  return { count, limit: limit.metrics, label: limit.label, left: Math.max(0, limit.metrics - count), allowed, graceDays: grace.days };
}
