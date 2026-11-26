// Filling a new Practice Workspace with the demo's company (spec 0063; GLOSSARY: Practice Workspace, Made-up Person):
// the demo is read as the records of a Workspace Export and written by the import, both of which every new feature keeps
// up, so a change to the demo's seed needs nothing here. The demo's people become made-up people, its Owner's place is
// taken by the person the Workspace is for, and what the file does not carry is added from the demo afterwards.
// SECURITY: the demo is only read; every write is to the new Workspace named, which the caller has just made.
import { randomUUID } from "node:crypto";
import type { Actor } from "./actor";
import { db } from "./db";
import { sendDueReminders, askForMissingValues } from "./questions";
import { saveDashboardText } from "./dashboards";
import { scanWorkspace } from "./heads-ups";
import { openNames, openRows } from "./sealed-columns";
import { showSnapshot, takeSnapshot } from "./snapshots";
import { setGroupMember } from "./team";
import { DEMO_WORKSPACE_ID } from "./team";
import type { WorkflowConfig, WorkflowStep } from "./types";
import { saveWorkflow } from "./workflows";
import { openWorkflowRows } from "./workflow-rows";
import { demoAsRecords, type ExportLabels } from "./workspace-export";
import { fillCopiedNumbers } from "./practice-fill";
import { createPlace, writeInto, type Written, type WrittenPerson } from "./workspace-import";
import { applyImportPlan } from "./workspace-import-people";
import { setDefaultTheme } from "./workspace-themes";
import type { HeaderRecord, WorkspaceExportRecord } from "@ziffr/pack/workspace-export";

/** The name a Practice Workspace starts with; its Owner may change it like any Workspace's. */
export const PRACTICE_NAME = "Practice Workspace";

/** What each row of the demo became in the new Workspace. */
export type CopyMaps = {
  person: Map<string, string>;
  group: Map<number, number>;
  metric: Map<number, number>;
  dashboard: Map<number, number>;
  deck: Map<number, number>;
  workflow: Map<number, number>;
};

/** A Workflow's configuration with every person, Group and dashboard it names replaced by what it became. Someone or
 * something with no counterpart is left out, never kept as the demo's: no id of the demo reaches the copy. A Webhook is
 * never carried. */
export function mappedWorkflow(config: WorkflowConfig, maps: Pick<CopyMaps, "person" | "group" | "dashboard">): WorkflowConfig {
  const people = (ids: string[] | undefined) => (ids ?? []).flatMap((id) => maps.person.get(id) ?? []);
  const groups = (ids: number[] | undefined) => (ids ?? []).flatMap((id) => maps.group.get(id) ?? []);
  const step = (s: WorkflowStep): WorkflowStep[] => {
    if (s.type === "approve") {
      const approvers = people(s.approvers);
      return approvers.length ? [{ ...s, approvers }] : [];
    }
    if (s.type === "tell") return [{ ...s, people: people(s.people), groups: groups(s.groups), webhooks: [] }];
    if (s.type === "send_snapshot") return [{ ...s, dashboardId: maps.dashboard.get(s.dashboardId) ?? 0, people: people(s.people), groups: groups(s.groups) }];
    if (s.type !== "checklist") return [s];
    const readGroup = s.readGroup === undefined ? undefined : maps.group.get(s.readGroup);
    // An item kept to a Group that is not there would be open to more people than it was: it is left out.
    if (s.readGroup !== undefined && readGroup === undefined) return [];
    const kept = readGroup === undefined ? {} : { readGroup };
    if (s.kind === "info") return [{ ...s, ...kept, people: people(s.people), groups: groups(s.groups) }];
    return [{ ...s, ...kept, assignee: (s.assignee && maps.person.get(s.assignee)) || null, ...(s.standIn === undefined ? {} : { standIn: (s.standIn && maps.person.get(s.standIn)) || null }) }];
  };
  return { ...config, steps: config.steps.flatMap(step) };
}

/** A made-up person's address: from their name, unique, under `.invalid`, which can never be routed. */
export function madeUpAddress(name: string, id: string): string {
  const local = name.normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, "").trim().toLowerCase().replace(/ +/g, ".").slice(0, 40) || "person";
  return `${local}.${id.slice(0, 8)}@practice.invalid`;
}

/** The demo's Owner as an actor, or null where this Ziffr's demo holds nothing. */
async function demoOwner(): Promise<Actor | null> {
  const { data, error } = await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("role", "owner").order("user_id").limit(1).maybeSingle();
  if (error) throw new Error("The demo could not be read.");
  return data ? { personId: data.user_id as string, workspaceId: DEMO_WORKSPACE_ID, role: "owner" } : null;
}

/** The records after the header, numbered as the import counts lines. */
async function* numbered(records: AsyncGenerator<WorkspaceExportRecord>): AsyncGenerator<{ record: WorkspaceExportRecord; line: number }> {
  let line = 1;
  for await (const record of records) yield { record, line: ++line };
}

/** Makes the people of the demo made-up people of the Workspace, and gives each what was theirs. */
async function keepMadeUp(actor: Actor, people: WrittenPerson[], groupOf: (label: string) => number, labels: ExportLabels, made: Map<string, string>): Promise<void> {
  const demoIdOf = new Map([...labels.person].map(([id, label]) => [label, id]));
  const ids = [...demoIdOf.values()];
  const { data } = ids.length ? await db().from("profiles").select("id, name, role, color").in("id", ids) : { data: [] };
  const demo = new Map((await openNames(DEMO_WORKSPACE_ID, data ?? [])).map((p) => [String(p.id), p as { name?: unknown; role?: unknown; color?: unknown }]));
  for (const p of people) {
    const from = demoIdOf.get(p.label)!;
    if (p.self) {
      made.set(from, actor.personId);
      for (const g of p.groups) await setGroupMember(actor, groupOf(g), actor.personId, true);
      continue;
    }
    const id = randomUUID();
    const was = demo.get(from);
    const { error } = await db().from("profiles").insert({ id, name: p.plan.name, role: String(was?.role ?? ""), color: String(was?.color ?? "#6B7280"), email: madeUpAddress(p.plan.name, id), made_up_in: actor.workspaceId });
    if (error) throw new Error("A made-up person could not be added.");
    const { error: joined } = await db().from("memberships").insert({ workspace_id: actor.workspaceId, user_id: id, role: p.role });
    if (joined) throw new Error("A made-up person could not be added.");
    made.set(from, id);
    await applyImportPlan(actor.workspaceId, id, p.role, { ...p.plan, groups: p.groups.map(groupOf) });
  }
}

/** The maps from the demo's rows to the copy's, from the labels both used. */
async function mapsOf(labels: ExportLabels, written: Written, person: Map<string, string>, workspaceId: string): Promise<CopyMaps> {
  const through = <K>(from: Map<K, string>, to: Map<string, number>) => new Map([...from].flatMap(([id, label]) => (to.has(label) ? [[id, to.get(label)!] as const] : [])));
  const group = through(labels.group, written.groups);
  // Everyone is the Workspace itself and no Group of the file: each Workspace has its own.
  const everyone = async (ws: string) => (await db().from("groups").select("id").eq("workspace_id", ws).eq("everyone", true).maybeSingle()).data?.id as number | undefined;
  const [from, to] = [await everyone(DEMO_WORKSPACE_ID), await everyone(workspaceId)];
  if (from !== undefined && to !== undefined) group.set(from, to);
  return { person, group, metric: through(labels.metric, written.metrics), dashboard: through(labels.dashboard, written.dashboards), deck: through(labels.deck, written.decks), workflow: through(labels.workflow, written.workflows) };
}

/** The Shares as the demo has them, Everyone's and Editors' included, which the file does not carry. */
async function copyShares(actor: Actor, maps: CopyMaps): Promise<void> {
  const { data } = await db().from("shares").select("object_type, object_id, user_id, group_id, role").eq("workspace_id", DEMO_WORKSPACE_ID).order("id").limit(2000);
  const things: Record<string, Map<number, number>> = { metric: maps.metric, dashboard: maps.dashboard, deck: maps.deck };
  for (const s of data ?? []) {
    const object = things[String(s.object_type)]?.get(Number(s.object_id));
    const user = s.user_id ? maps.person.get(String(s.user_id)) : null;
    const group = s.group_id === null || s.group_id === undefined ? null : maps.group.get(Number(s.group_id));
    // The Owner's own place needs no Share of what they own.
    if (object === undefined || (!user && !group)) continue;
    let q = db().from("shares").delete().eq("workspace_id", actor.workspaceId).eq("object_type", String(s.object_type)).eq("object_id", object);
    q = user ? q.eq("user_id", user) : q.eq("group_id", group!);
    await q;
    const { error } = await db().from("shares").insert({ workspace_id: actor.workspaceId, object_type: s.object_type, object_id: object, user_id: user, group_id: user ? null : group, role: s.role });
    if (error) throw new Error("A Share could not be copied.");
  }
}

/** Who stands in for whom, which the file does not carry. */
async function copyStandIns(actor: Actor, maps: CopyMaps): Promise<void> {
  const { data } = await db().from("tokens").select("metric_id, submitter_id, stand_in_id").eq("workspace_id", DEMO_WORKSPACE_ID).is("stands_in_for", null).not("stand_in_id", "is", null).limit(2000);
  for (const t of data ?? []) {
    const [metric, submitter, standIn] = [maps.metric.get(Number(t.metric_id)), maps.person.get(String(t.submitter_id)), maps.person.get(String(t.stand_in_id))];
    if (metric === undefined || !submitter || !standIn) continue;
    await db().from("tokens").update({ stand_in_id: standIn }).eq("workspace_id", actor.workspaceId).eq("metric_id", metric).eq("submitter_id", submitter).is("stands_in_for", null);
  }
}

/** Who approves, who is told and who gets what in each Workflow, as the demo's have it. */
async function copyWorkflowPeople(actor: Actor, maps: CopyMaps): Promise<void> {
  const { data } = await db().from("workflows").select("id, name, owner_id, config").eq("workspace_id", DEMO_WORKSPACE_ID).order("id");
  for (const w of await openWorkflowRows(DEMO_WORKSPACE_ID, data)) {
    const id = maps.workflow.get(Number(w.id));
    if (id === undefined) continue;
    try {
      await saveWorkflow(actor, id, String(w.name), mappedWorkflow(w.config as WorkflowConfig, maps), { message: "Copied from the demo" });
    } catch (e) {
      // The Workflow stays as the import made it.
      console.error("Practice Workspace: a Workflow kept the import's people:", (e as Error).message);
    }
  }
}

/** The dashboards' introductions, and the default Theme. */
async function copyWords(actor: Actor, maps: CopyMaps): Promise<void> {
  const { data } = await db().from("dashboards").select("id, intro").eq("workspace_id", DEMO_WORKSPACE_ID).order("id");
  for (const d of await openRows("dashboards", DEMO_WORKSPACE_ID, data)) {
    const id = maps.dashboard.get(Number(d.id));
    if (id !== undefined && typeof d.intro === "string" && d.intro.trim()) await saveDashboardText(actor, id, { intro: d.intro });
  }
  const { data: chosen } = await db().from("themes").select("name").eq("workspace_id", DEMO_WORKSPACE_ID).eq("is_default", true).maybeSingle();
  const { data: mine } = chosen ? await db().from("themes").select("id").eq("workspace_id", actor.workspaceId).eq("name", chosen.name as string).order("id", { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (mine) await setDefaultTheme(actor, mine.id as number);
}

/** A Snapshot of each period the demo shows one of, taken from the copy. */
async function copySnapshots(actor: Actor, maps: CopyMaps): Promise<void> {
  const { data } = await db().from("dashboard_snapshots").select("dashboard_id, kind, period_start, shown_at").eq("workspace_id", DEMO_WORKSPACE_ID).is("deleted_at", null).not("shown_at", "is", null).order("period_start").limit(50);
  for (const s of data ?? []) {
    const dashboard = maps.dashboard.get(Number(s.dashboard_id));
    if (dashboard === undefined) continue;
    try {
      await showSnapshot(actor, await takeSnapshot(actor, dashboard, { kind: s.kind, start: s.period_start }));
    } catch (e) {
      console.error("Practice Workspace: no Snapshot of a period:", (e as Error).message);
    }
  }
}

/** One part added after the import. A part that fails is logged and left out: the Workspace is still worth having. */
async function extra(what: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(`Practice Workspace: ${what}:`, (e as Error).message);
  }
}

/**
 * Makes a Practice Workspace for the person, still marked as being filled, and fills it with a copy of the demo. Where
 * the demo holds nothing it stays empty. `made` is told the new id as soon as there is one, so the caller can delete a
 * half-made one. The caller opens it for use.
 */
export async function makeFromDemo(personId: string, made: (workspaceId: string) => void): Promise<string> {
  const owner = await demoOwner();
  const source = owner ? await demoAsRecords(owner) : null;
  const first = source ? (await source.records.next()).value as HeaderRecord : null;
  const header: HeaderRecord = { ...(first ?? { kind: "header", format: "ziffr.workspace-export/1", ziffr: "0.0.0", exportedAt: "2026-01-01T00:00:00Z", workspace: { name: PRACTICE_NAME } }), workspace: { ...first?.workspace, name: PRACTICE_NAME } };
  const workspaceId = await createPlace(personId, header, personId);
  made(workspaceId);
  if (!owner || !source) return workspaceId;
  const people = new Map<string, string>();
  const email = (await db().from("profiles").select("email").eq("id", owner.personId).maybeSingle()).data?.email;
  const written = await writeInto(personId, workspaceId, header, {
    // Shares are copied from the demo afterwards, with Everyone's and Editors'.
    records: numbered(without(source.records, "share")),
    totals: source.totals,
    isSelf: (p) => p.email.toLowerCase() === String(email ?? "").toLowerCase(),
    keepPeople: (actor, list, groupOf) => keepMadeUp(actor, list, groupOf, source.labels, people),
  });
  const actor: Actor = { personId, workspaceId, role: "owner" };
  const maps = await mapsOf(source.labels, written, people, workspaceId);
  await copyShares(actor, maps);
  await extra("Stand-ins", () => copyStandIns(actor, maps));
  await extra("Workflows' people", () => copyWorkflowPeople(actor, maps));
  await extra("introductions and Theme", () => copyWords(actor, maps));
  // What the demo lacks for year on year and annual progress, in the copy only: made up before the Snapshots keep it.
  await extra("made-up numbers", () => fillCopiedNumbers(workspaceId));
  await extra("Snapshots", () => copySnapshots(actor, maps));
  // What the day would send, so the Outbox has something to read: held there, as everything of this Workspace is.
  await extra("the day's messages", async () => { await askForMissingValues(actor); await sendDueReminders(actor); });
  await extra("Heads-ups", () => scanWorkspace(workspaceId, new Date().toISOString()));
  return workspaceId;
}

/** The records without those of one kind. */
async function* without(records: AsyncGenerator<WorkspaceExportRecord>, kind: WorkspaceExportRecord["kind"]): AsyncGenerator<WorkspaceExportRecord> {
  for await (const r of records) if (r.kind !== kind) yield r;
}
