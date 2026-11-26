// Version history (GLOSSARY: Version): seeing, naming and restoring earlier states of what people build. Who may
// see and restore follows who may see and edit the object; a restore brings back only what the restorer may show.
// Every function takes the Actor first and works only inside the actor's Workspace.
import { assertSettingsDesigns, assertWidgetDesigns } from "./widget-designs";
import { db } from "./db";
import { can, Forbidden, Refused, type Actor } from "./actor";
import { checkedFormula } from "./derived-metrics";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { deckMetricIds, deckMetricIdsAdded } from "./visibility";
import { snapshotPartProblem } from "./snapshot-parts";
import { widgetMetricIds } from "./widget-metrics";
import { withoutUnaskedMetrics } from "./slide-text";
import { isDashboardView, isView } from "./widget-templates";
import { getMetrics } from "./workspace-data";
import { diffSummary, openVersionSnapshot, recordVersion, VERSION_TYPES, type VersionType } from "./versions";
import { sealedPatch } from "./sealed-columns";
import { replaceDashboard } from "./dashboard-restore";
import { ServerFault } from "./server-fault";
import type { Format, ThemeSlides, ThemeTokens, WidgetSettings, WorkflowConfig } from "./types";
import { keptUnit } from "./units";
import { calculationNoteFrom } from "./calculation-note";
import { saveWorkflow } from "./workflows";
import { guestWorkflowIds } from "./period-timeline";
import { restorableWords, sealedWords, snapshotAccess } from "./snapshots";
import { restoreMetricTags } from "./tags";
import { visitorOptionalText, visitorVersionType } from "./demo-visitor-words";
import { chargeVisitor } from "./demo-visitor-limits";
import { visitorSharedStaysSeen } from "./demo-visitor-sharing";
import { demoData } from "./demo-query";
import { DEMO_STORE_MAX } from "./demo-limits";
import { refuseSeeded } from "./demo-seeded-rows";

/** How a restored Workflow is saved; tests may pass their own. */
export type RestoreEffects = {
  /** Saves a Workflow from a restored version, through the same checks as editing it, as the restorer. */
  restoreWorkflow: (id: number, name: string, config: unknown, message: string) => Promise<void>;
};

/** The core's own: the Workflow is saved by the actor, with the restore as its version message. */
const restoreEffectsFor = (actor: Actor): RestoreEffects => ({
  restoreWorkflow: async (id, name, config, message) => { await saveWorkflow(actor, id, name, config as WorkflowConfig, { message }); },
});

/** Whether the actor may see and restore the versions of an object: the same rules as seeing and editing it. */
export async function versionAccess(actor: Actor, type: VersionType, id: number): Promise<{ view: boolean; edit: boolean }> {
  // Only the kinds Ziffr keeps versions of; anything else a browser sends is refused.
  if (!VERSION_TYPES.includes(type)) throw new Forbidden();
  const ws = actor.workspaceId;
  const me = actor.personId;
  if (type === "deck") {
    const role = (await visibleDecks(ws, me)).find((d) => d.id === id)?.role;
    return { view: Boolean(role), edit: role === "owner" || role === "editor" };
  }
  // A Snapshot's words follow the rules for opening it (spec 0013): shown ones for whoever may open its dashboard,
  // drafts for its owner and Editors who see every Metric it kept.
  if (type === "snapshot") return snapshotAccess(actor, id);
  if (type === "workflow" || type === "template") {
    const { data } = await db().from(type === "workflow" ? "workflows" : "team_templates").select("owner_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    // A Guest sees only what is shared with them: the Versions of their Metrics' Workflows, of no team template.
    const guestSees = await guestWorkflowIds(actor);
    const hidden = guestSees !== null && (type === "template" || !guestSees.has(id));
    return { view: Boolean(data) && !hidden, edit: !hidden && data?.owner_id === me };
  }
  if (type === "theme") {
    const { data } = await db().from("themes").select("id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    // Themes' history says who changed them: not for a Guest, who sees only what is shared with them and not who else
    // is in the Workspace (the canvas still sends them the Themes their dashboards use).
    return { view: Boolean(data) && actor.role !== "guest", edit: Boolean(data) && can(actor, "manage-themes") };
  }
  if (type === "metric") {
    const { data } = await db().from("metrics").select("owner_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    const visible = await visibleMetricIds(ws, me, await getMetrics(ws));
    return { view: visible.has(id), edit: data?.owner_id === me };
  }
  const dashboardId = type === "dashboard" ? id : (await db().from("widgets").select("dashboard_id").eq("id", id).eq("workspace_id", ws).maybeSingle()).data?.dashboard_id;
  if (!dashboardId) {
    const { data } = await db().from("widgets").select("owner_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    const own = data?.owner_id === me;
    return { view: own, edit: own };
  }
  const role = (await visibleDashboards(ws, me)).find((d) => d.id === dashboardId)?.role;
  return { view: Boolean(role), edit: role === "owner" || role === "editor" };
}

/** The versions of an object, newest first, with what changed in each; only for those who see the object. */
export async function listVersions(actor: Actor, type: VersionType, id: number) {
  const a = await versionAccess(actor, type, id);
  if (!a.view) throw new Forbidden();
  let q = db().from("versions").select("id, version, snapshot, author_id, message, name, created_at, updated_at").eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id);
  // A Snapshot's draft is its owner's and Editors' (spec 0013): anyone else sees only the Versions since it was shown.
  if (type === "snapshot" && !a.edit) {
    const { data: s } = await db().from("dashboard_snapshots").select("shown_at").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
    q = q.gte("updated_at", s?.shown_at ?? "9999-12-31");
  }
  const { data } = await q.order("version", { ascending: false }).limit(60);
  const rows = data ?? [];
  // Compared as the words were written: sealed ones (spec 0028) are opened first.
  const kept = await Promise.all(rows.map((v) => openVersionSnapshot(actor.workspaceId, type, id, v.version, v.snapshot)));
  return {
    canRestore: a.edit,
    versions: rows.map((v, i) => ({
      id: v.id, version: v.version, author: v.author_id, message: v.message, name: v.name, at: v.updated_at,
      changes: diffSummary(type, kept[i + 1] ?? null, kept[i]),
    })),
  };
}

/** A version of the actor's workspace that the actor may restore, or Forbidden. */
async function restorable(actor: Actor, versionId: number) {
  const { data: v } = await db().from("versions").select("*").eq("id", versionId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!v || !(await versionAccess(actor, v.object_type, v.object_id)).edit) throw new Forbidden();
  // In the demo only the kinds a visitor may make (dashboards, widgets, Themes, templates) are named or brought back.
  visitorVersionType(actor, v.object_type);
  return v;
}

/** In a demo visit, refuses before any write a restore of a dashboard, widget, Theme or template the seed made (a restore writes
 * its Theme, words and widgets back). */
async function refuseSeededRestore(actor: Actor, type: string, id: number) {
  if (type === "dashboard") await refuseSeeded(actor, "dashboards", id);
  else if (type === "theme") await refuseSeeded(actor, "themes", id);
  else if (type === "template") await refuseSeeded(actor, "team_templates", id);
  else if (type === "deck") await refuseSeeded(actor, "decks", id);
  else if (type === "widget") {
    const { data } = await db().from("widgets").select("dashboard_id").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (data?.dashboard_id) await refuseSeeded(actor, "dashboards", data.dashboard_id);
  }
}

/** Names a version, like a git tag. */
export async function nameVersion(actor: Actor, versionId: number, name: string) {
  await restorable(actor, versionId);
  await db().from("versions").update({ name: String(visitorOptionalText(actor, String(name ?? ""), "name")).trim().slice(0, 80) || null }).eq("id", versionId).eq("workspace_id", actor.workspaceId);
}

/** Names the current state: a named version is never merged into. */
export async function saveNamedVersion(actor: Actor, type: VersionType, id: number, name: string) {
  if (!(await versionAccess(actor, type, id)).edit) throw new Forbidden();
  visitorVersionType(actor, type);
  if (type === "deck") await refuseSeeded(actor, "decks", id);
  // Counted before anything is written: a visit names a few Versions a window, and the demo holds a limited number.
  await chargeVisitor(actor, "named", 1, DEMO_STORE_MAX.namedVersionsPerVisit, "You have named a few versions already. Try again when the demo starts fresh.");
  await recordVersion(type, id, actor.personId, { name: String(visitorOptionalText(actor, String(name ?? ""), "name")).trim().slice(0, 80) || "Named version" });
}

/** A restore the database did not take is a failure, never recorded as a restored version. */
function mustRestore({ error }: { error: unknown }) {
  if (error) throw new ServerFault("The version could not be restored.");
}

const HIDDEN = "This version shows metrics that are not shared with you, so it cannot be restored by you. Ask the owner.";

/** Writes an old state back and records it as a new version: history only ever grows. A restore places widgets
 * like a drop does (only known templates, only Metrics the restorer sees, including those named in settings), so an
 * old version cannot bring back a Metric that was taken off a shared dashboard. */
export async function restoreVersion(actor: Actor, versionId: number, effects: RestoreEffects = restoreEffectsFor(actor)) {
  const v = await restorable(actor, versionId);
  await refuseSeededRestore(actor, v.object_type, v.object_id);
  const s = { ...(await openVersionSnapshot(actor.workspaceId, v.object_type, v.object_id, v.version, v.snapshot)) };
  const id = v.object_id as number;
  const ws = actor.workspaceId;
  const visible = async () => visibleMetricIds(ws, actor.personId, await getMetrics(ws));
  if (v.object_type === "widget" || v.object_type === "dashboard") {
    const widgets = (v.object_type === "widget" ? [s] : ((s.widgets as Record<string, unknown>[]) ?? [])) as { template?: string; metric_ids?: number[]; settings?: WidgetSettings }[];
    if (widgets.some((w) => !w.template || !isDashboardView(w.template))) throw new Forbidden();
    const seen = await visible();
    if (widgets.flatMap((w) => widgetMetricIds(w.metric_ids ?? [], w.settings)).some((m) => !seen.has(m))) throw new Error(HIDDEN);
  }
  if (v.object_type === "template" && !(isView(String(s.view)) || s.view === "slide")) throw new Forbidden();
  // A deck restore may only bring back Metrics the restorer sees, as saving a deck does.
  if (v.object_type === "deck") {
    const { data: cur } = await db().from("decks").select("document").eq("id", id).eq("workspace_id", ws).single();
    // Its Snapshot Parts are checked as a save's are (spec 0061): a Version keeps what was stored.
    const problem = snapshotPartProblem(s.document);
    if (problem) throw new Refused(problem);
    const seen = await visible();
    if (deckMetricIdsAdded(cur?.document, s.document).some((m) => !seen.has(m))) throw new Error(HIDDEN);
  }
  // A Theme picked back then may be gone since; the dashboard or deck then follows the default.
  if ((v.object_type === "dashboard" || v.object_type === "deck") && s.theme_id) {
    const { data: t } = await db().from("themes").select("id").eq("id", s.theme_id as number).eq("workspace_id", ws).maybeSingle();
    if (!t) s.theme_id = null;
  }
  const at = new Date().toISOString();
  switch (v.object_type as VersionType) {
    case "workflow":
      await effects.restoreWorkflow(id, String(s.name ?? ""), s.config, `Restored version ${v.version}${v.name ? ` (${v.name})` : ""}`);
      break;
    case "theme": {
      const tokens = cleanTokens(s.tokens as ThemeTokens);
      if (!tokens) throw new Forbidden();
      mustRestore(await db().from("themes").update({ name: String(s.name ?? "").slice(0, 60), tokens, ...(s.slides ? { slides: cleanSlides(s.slides as ThemeSlides) } : {}), updated_at: at }).eq("id", id).eq("workspace_id", ws));
      break;
    }
    case "template":
      // A template's widget, and a slide layout's widgets, keep their View Designs: checked again before they are stored.
      assertSettingsDesigns((s.body as { settings?: unknown } | undefined)?.settings);
      assertWidgetDesigns(s.body);
      mustRestore(await db().from("team_templates").update({ kind: s.kind, name: s.name, description: s.description, view: s.view, slots: s.slots, body: s.body, w: s.w, h: s.h, updated_at: at }).eq("id", id).eq("workspace_id", ws));
      break;
    case "widget":
      // A Version keeps what was stored; its View Designs are checked again before they are stored once more.
      assertSettingsDesigns(s.settings);
      // A widget of a shared dashboard comes back showing only Metrics the dashboard's recipients see (spec 0051, ticket 11).
      await visitorSharedStaysSeen(actor, "dashboard", demoData(await db().from("widgets").select("dashboard_id").eq("id", id).eq("workspace_id", ws).maybeSingle())?.dashboard_id as number | null | undefined, widgetMetricIds((s.metric_ids as number[] | undefined) ?? [], s.settings as Parameters<typeof widgetMetricIds>[1]));
      mustRestore(await db().from("widgets").update(await sealedPatch("widgets", ws, id, { template: s.template, metric_ids: s.metric_ids, settings: s.settings, title: s.title })).eq("id", id).eq("workspace_id", ws));
      break;
    case "dashboard": {
      const { data: d } = await db().from("dashboards").select("owner_id").eq("id", id).eq("workspace_id", ws).single();
      await visitorSharedStaysSeen(actor, "dashboard", id, ((s.widgets as Record<string, unknown>[]) ?? []).flatMap((w) => widgetMetricIds((w.metric_ids as number[] | undefined) ?? [], w.settings as Parameters<typeof widgetMetricIds>[1])));
      const widgets = (s.widgets as Record<string, unknown>[]) ?? [];
      // Everything that can refuse is asked before anything is written.
      for (const w of widgets) assertSettingsDesigns(w.settings);
      // Versions from before introductions were kept have none: the introduction then stays as it is.
      await replaceDashboard(ws, id, { name: s.name, ...(s.theme_id !== undefined ? { theme_id: s.theme_id } : {}), ...(typeof s.intro === "string" ? { intro: s.intro } : {}) }, widgets.map((w) => ({
        template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h,
        owner_id: d?.owner_id ?? actor.personId, dashboard_id: id, saved: false,
      })));
      break;
    }
    case "deck":
      assertWidgetDesigns(s.document);
      // As a save stores it: a text box lists only the Metrics its words ask for, which were checked above.
      s.document = withoutUnaskedMetrics(s.document);
      await visitorSharedStaysSeen(actor, "deck", id, deckMetricIds(s.document));
      mustRestore(await db().from("decks").update({ name: s.name, ...(s.theme_id !== undefined ? { theme_id: s.theme_id } : {}), ...(s.footer !== undefined ? { footer: s.footer } : {}), document: s.document, updated_at: at }).eq("id", id).eq("workspace_id", ws));
      break;
    case "snapshot": {
      // Only the words come back; the numbers never changed. Once shown, it says its words changed since.
      const { data: cur } = await db().from("dashboard_snapshots").select("shown_at").eq("id", id).eq("workspace_id", ws).is("deleted_at", null).single();
      // A widget drawing a Metric the restorer does not see keeps its words as they are now (#193).
      const words = await restorableWords(actor, id, s.words);
      mustRestore(await db().from("dashboard_snapshots").update({ words: await sealedWords(ws, id, words), ...(cur?.shown_at ? { words_changed_at: at } : {}) }).eq("id", id).eq("workspace_id", ws).is("deleted_at", null));
      break;
    }
    case "metric": {
      const fields = ["name", "description", "unit", "unit_position", "format", "decimals", "period", "submission_rule", "polarity", "target_min", "target_max", "attainment_method", "sources", "aggregation", "formula"];
      // A version from before units had a side gets the unit its format used to add, so it shows as it did then.
      const kept: Record<string, unknown> = "format" in s && "unit" in s && !("unit_position" in s) ? keptUnit({ ...s, unit: String(s.unit ?? ""), format: s.format as Format }) : s;
      // A restore never turns a Derived Metric into a plain one or back: the kind stays what it is now, with its Sources.
      // A formula it brings back goes through the checks of changing one, so an old formula cannot reach what a change
      // would be refused (an input the Editor or the owner may not share, a Metric that is Derived since, itself).
      const { data: now } = await db().from("metrics").select("slug, period, owner_id, formula, total_targets").eq("id", id).eq("workspace_id", ws).single();
      const patch = Object.fromEntries(fields.filter((f) => f in kept).map((f) => [f, kept[f]]));
      // A Version without a Calculation Note had none, so a restore takes today's away (spec 0060).
      patch.calculation_note = calculationNoteFrom(kept.calculation_note);
      if (now?.total_targets) {
        // A Total keeps what its parts share, has no formula to bring back, and takes no range where its target is theirs.
        for (const k of ["formula", "sources", "period", "aggregation", "unit", "format", ...(now.total_targets === "parts" ? ["target_min", "target_max"] : [])]) delete patch[k];
      } else if (now?.formula) {
        // Its period follows its inputs', and it has no Sources: those stay.
        delete patch.sources;
        delete patch.period;
        if (typeof patch.formula === "string") patch.formula = await checkedFormula(actor, { id, slug: now.slug, period: now.period, owner_id: now.owner_id }, patch.formula).catch((e) => { throw e instanceof Refused ? new Refused(`This version cannot be restored: ${e.message}`) : e; });
        else delete patch.formula;
      } else {
        delete patch.formula;
        if (s.formula) { delete patch.sources; delete patch.period; delete patch.aggregation; }
      }
      mustRestore(await db().from("metrics").update(await sealedPatch("metrics", ws, id, patch)).eq("id", id).eq("workspace_id", ws));
      // Versions from before Tags were kept have none: the Tags then stay as they are.
      if (Array.isArray(s.tags)) await restoreMetricTags(actor, id, s.tags);
      break;
    }
  }
  await recordVersion(v.object_type, id, actor.personId, { message: `Restored version ${v.version}${v.name ? ` (${v.name})` : ""}` });
}
