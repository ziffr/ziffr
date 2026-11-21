// Changing a Workspace Key, wrapping keys again after the Installation key changed, and the re-encryption job's reach
// beyond the sealed columns (spec 0028, ticket #250), against the database: words sealed inside JSON columns (Findings,
// Snapshots, Versions, View Links), Breakdown labels with their index and history, a Webhook's external task with its
// hash, a new key version taking over, a retired one destroyed only once nothing refers to it, and failures counted.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { dashboardWidgets } from "./page-data";
import { openHistoryLabel } from "./breakdown-labels";
import { ALL_SEALED_COLUMNS } from "./sealed-columns";
import { SEALED_LABELS } from "./sealed-labels";
import { SEALED_THINGS } from "./sealed-things";
import { addContact, removeContact } from "./team";
import { openNames } from "./sealed-columns";
import { editSnapshotWords, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { installationAdmin, workspace } from "./test/db-fixtures";
import { openVersionSnapshot } from "./versions";
import { createViewLink, openViewLink } from "./view-links";
import { changeWorkspaceKey } from "./workspace-key-change";
import { reencryptionJob } from "./workspace-key-job";
import { forgetWorkspaceKey, installationKeyFingerprint, installationKeyWrapper, isSealed, sealedVersion, workspaceCipher } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const savedPrevious = process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
const cleanups: (() => Promise<void>)[] = [];
const KEY = () => Buffer.alloc(32, 71).toString("base64");
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = KEY(); delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS; });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
  if (savedPrevious === undefined) delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
  else process.env.ZIFFR_SECRETS_KEY_PREVIOUS = savedPrevious;
}, 120_000);

const october = { kind: "month", start: "2026-10-01" };
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const only = (w: { id: string }) => ({ only: [w.id] });

/** An Installation Admin. */
async function admin() {
  const a = await installationAdmin();
  cleanups.push(a.cleanup);
  return a;
}

/** A Workspace written entirely in clear, as before the upgrade: a Finding with words, a Snapshot, Versions, frozen and
 * Snapshot View Links, Breakdown rows and history, a Webhook's external task, a Contact. */
async function plainWorld() {
  delete process.env.ZIFFR_SECRETS_KEY;
  const w = await workspace("Change");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const actor = w.actor(sara);
  const marker = `mk${Date.now().toString(36)}`;
  const rev = await w.metric(sara, { name: "Revenue" });
  for (const [p, v] of [["2026-09-01", 90], ["2026-10-01", 100]] as const) await w.value(rev.id, p, v);
  const dash = await createDashboard(actor, "Words");
  await saveDashboardText(actor, dash, { intro: `Intro ${marker}` });
  const finding = await placeWidget(actor, dash, {
    type: "spec", template: "story", metricIds: [rev.id], title: `Title ${marker}`,
    settings: { kicker: `Kicker ${marker}`, headline: `Headline ${marker}`, subline: `Subline ${marker}`, footnote: `Footnote ${marker}`, source: `Source ${marker}`, panels: [] },
  });
  // Breakdown rows in clear, one of them deleted so that the history holds its label, and an old history entry with no row.
  const { data: obs } = await db().from("observations").select("id").eq("metric_id", rev.id).eq("period_start", "2026-10-01").single();
  const { data: rows } = await db().from("breakdown_rows").insert([
    { observation_id: obs!.id, label: `Shop ${marker}`, value: 60, position: 0, workspace_id: w.id },
    { observation_id: obs!.id, label: `Web ${marker}`, value: 40, position: 1, workspace_id: w.id },
  ]).select("id, label");
  await db().from("breakdown_rows").delete().eq("id", rows![1].id);
  await db().from("breakdown_history").insert({ observation_id: obs!.id, label: `Legacy ${marker}`, value: 1, workspace_id: w.id });
  const snapshot = await takeSnapshot(actor, dash, october);
  await showSnapshot(actor, snapshot);
  await editSnapshotWords(actor, snapshot, { intro: `Edited ${marker}` });
  const frozen = await createViewLink(actor, "dashboard", dash, { label: "Frozen", expires: inAMonth(), frozen: true });
  const toSnapshot = await createViewLink(actor, "dashboard", dash, { label: "Snapshot", expires: inAMonth(), frozen: false, snapshotId: snapshot });
  // A Webhook's external task, hashed the way it was before sealing existed.
  const hook = randomUUID();
  await db().from("webhooks").insert({ id: hook, workspace_id: w.id, name: "Tasks", url: "https://tasks.example.test/hook", secret: "whsec_planted" });
  const action = await w.action({ metric_id: rev.id, period_start: "2026-10-01", asker_id: sara, assignee_id: sara, question: `Why ${marker}?` });
  await db().from("webhook_external_ids").insert({ id: randomUUID(), workspace_id: w.id, webhook_id: hook, action_id: action, system: "jira", external_id: `TASK-${marker}`, url: "https://tasks.example.test/1", external_hash: `p1.${createHash("sha256").update(marker).digest("hex")}` });
  const contact = await w.contact({ email: `Ada${marker}@Example.test`, slack_handle: "@ada" });
  process.env.ZIFFR_SECRETS_KEY = KEY();
  return { w, sara, actor, rev, dash, finding, snapshot, frozen, toSnapshot, hook, marker, contact, history: rows![1].id as number };
}

/** Everything the Workspace keeps in the tables with words, as text. */
async function dump(workspaceId: string): Promise<string> {
  const parts: unknown[] = [];
  for (const table of ["dashboards", "widgets", "dashboard_snapshots", "view_links", "versions", "breakdown_rows", "breakdown_history", "webhook_external_ids", "metrics", "actions"]) {
    parts.push((await db().from(table).select("*").eq("workspace_id", workspaceId)).data);
  }
  return JSON.stringify(parts);
}

/** What every reader shows of the world, to compare before and after. */
async function readings(world: Awaited<ReturnType<typeof plainWorld>>) {
  const { w, actor, dash, snapshot, frozen, toSnapshot, rev } = world;
  forgetWorkspaceKey(w.id);
  const labels = (d: { breakdowns: Record<number, Record<string, { label: string }[]>> }) => Object.values(d.breakdowns[rev.id] ?? {}).flat().map((r) => r.label);
  const open = await openSnapshot(actor, snapshot);
  const [widget] = await dashboardWidgets(actor, dash);
  const link = await openViewLink(frozen);
  const viaSnapshot = await openViewLink(toSnapshot);
  // What the Versions keep, opened for each: the words come back as written.
  const versions: string[] = [];
  for (const [type, id] of [["dashboard", dash], ["snapshot", snapshot], ["widget", world.finding]] as const) {
    const { data } = await db().from("versions").select("version, snapshot").eq("workspace_id", w.id).eq("object_type", type).eq("object_id", id).order("version");
    for (const v of data ?? []) versions.push(JSON.stringify(await openVersionSnapshot(w.id, type, id, v.version as number, v.snapshot)));
  }
  expect(versions.length).toBeGreaterThan(0);
  return { intro: open.intro, widget: [widget.title, widget.settings], snapshotLabels: labels(open.data), frozenIntro: link?.intro, frozenLabels: link ? labels(link.data) : null, viaSnapshotIntro: viaSnapshot?.intro, versions };
}

describe("the re-encryption job beyond the sealed columns", () => {
  it("seals Findings, Snapshots, Versions, View Links, Breakdown labels with index and history, and external tasks, and everything still reads", async () => {
    const world = await plainWorld();
    const { w, marker, history, hook } = world;
    expect(await dump(w.id)).toContain(marker);
    const before = await readings(world);
    const first = await reencryptionJob({ ...only(w), batch: 1 });
    expect(first.errors).toBe(0);
    expect(first.unopenable).toBe(0);
    expect(await dump(w.id)).not.toContain(marker);
    expect(JSON.stringify(await readings(world))).toBe(JSON.stringify(before));
    const cipher = await workspaceCipher(w.id);
    // Breakdown rows: label and index; history sealed for the row it came from, and an old entry for its own id.
    const { data: rows } = await db().from("breakdown_rows").select("id, label, label_index").eq("workspace_id", w.id);
    expect(rows).toHaveLength(1);
    expect(isSealed(rows![0].label as string)).toBe(true);
    expect(rows![0].label_index).toBe(cipher.blindIndex("breakdown_rows.label", `Shop ${marker}`));
    const { data: hist } = await db().from("breakdown_history").select("id, row_id, label").eq("workspace_id", w.id).order("id");
    expect(hist!.map((h) => openHistoryLabel(cipher, h)).sort()).toEqual([`Legacy ${marker}`, `Web ${marker}`]);
    expect(hist!.every((h) => isSealed(h.label as string))).toBe(true);
    expect(hist!.find((h) => Number(h.row_id) === history)).toBeDefined();
    // The external task found again by its hash under the current key.
    const { data: ext } = await db().from("webhook_external_ids").select("external_hash, external_id").eq("workspace_id", w.id).single();
    expect(ext!.external_hash).toBe(cipher.blindIndex("webhook_external_ids.external_id", `${hook}\0jira\0${Buffer.from(`TASK-${marker}`).toString("hex")}`));
    expect(isSealed(ext!.external_id as string)).toBe(true);
    // Every kind is checked off, and a second run changes nothing.
    const { data: progress } = await db().from("workspace_seal_progress").select("table_name, column_name, done_at").eq("workspace_id", w.id);
    for (const t of SEALED_THINGS) expect(progress!.find((p) => p.table_name === t.table && p.column_name === t.column)?.done_at, `${t.table}.${t.column}`).not.toBeNull();
    for (const [table, cols] of Object.entries(ALL_SEALED_COLUMNS)) for (const c of cols) expect(progress!.find((p) => p.table_name === table && p.column_name === c)?.done_at, `${table}.${c}`).not.toBeNull();
    const second = await reencryptionJob(only(w));
    expect([second.rowsSealed, second.rowsMoved, second.errors]).toEqual([0, 0, 0]);
  });

  it("lets a Snapshot's Breakdown labels be sealed but never its numbers", async () => {
    const world = await plainWorld();
    const { data: row } = await db().from("dashboard_snapshots").select("frozen").eq("id", world.snapshot).single();
    const frozen = row!.frozen as { data: { breakdowns: Record<string, Record<string, { label: string; value: number }[]>> } };
    const [metric] = Object.keys(frozen.data.breakdowns);
    const [period] = Object.keys(frozen.data.breakdowns[metric]);
    const changed = (f: (r: { label: string; value: number }) => { label: string; value: number }) => ({ ...frozen, data: { ...frozen.data, breakdowns: { ...frozen.data.breakdowns, [metric]: { ...frozen.data.breakdowns[metric], [period]: frozen.data.breakdowns[metric][period].map(f) } } } });
    const call = (value: unknown) => db().rpc("seal_json", { p_workspace: world.w.id, p_table: "dashboard_snapshots", p_column: "frozen", p_id: world.snapshot, p_was: frozen, p_new: value });
    // Directly, not even a label changes; through seal_json a label does, a number does not.
    expect((await db().from("dashboard_snapshots").update({ frozen: changed((r) => ({ ...r, label: "x" })) }).eq("id", world.snapshot)).error).not.toBeNull();
    expect((await call(changed((r) => ({ ...r, value: r.value + 1 })))).error).not.toBeNull();
    // A label may only become sealed text of a newer key version, never other plain text.
    expect((await call(changed((r) => ({ ...r, label: "Relabelled" })))).error).not.toBeNull();
    const cipher = await workspaceCipher(world.w.id);
    expect((await call(changed((r) => ({ ...r, label: cipher.seal({ table: "dashboard_snapshots", column: "frozen.data.x", row: world.snapshot }, "Relabelled") })))).data).toBe(true);
    expect((await db().rpc("seal_json", { p_workspace: world.w.id, p_table: "profiles", p_column: "name", p_id: 1, p_was: {}, p_new: {} })).error).not.toBeNull();
  });

  it("lists every sealed thing in the progress page's words", () => {
    const expected = [...Object.entries(ALL_SEALED_COLUMNS).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`)), ...SEALED_THINGS.map((t) => `${t.table}.${t.column}`), "audit_events.details"].sort();
    expect(Object.keys(SEALED_LABELS).sort()).toEqual(expected);
  });

  it("leaves a row alone whose sealed word does not open, and counts it", async () => {
    const world = await plainWorld();
    await reencryptionJob(only(world.w));
    const cipher = await workspaceCipher(world.w.id);
    // A word sealed for another widget: sealed, in the right format, but not for this place.
    const { data: row } = await db().from("widgets").select("settings").eq("id", world.finding).single();
    const planted = { ...(row!.settings as Record<string, unknown>), headline: cipher.seal({ table: "widgets", column: "settings.headline", row: world.finding + 1 }, "Elsewhere"), kicker: `Plain again ${world.marker}` };
    await db().from("widgets").update({ settings: planted }).eq("id", world.finding);
    await db().from("workspace_seal_progress").update({ done_at: null }).eq("workspace_id", world.w.id).eq("table_name", "widgets").eq("column_name", "settings");
    const run = await reencryptionJob(only(world.w));
    expect(run.unopenable).toBeGreaterThanOrEqual(1);
    const { data: after } = await db().from("widgets").select("settings").eq("id", world.finding).single();
    // Not half rewritten: the plain kicker is still plain because the row holds one it could not open.
    expect((after!.settings as { kicker: string }).kicker).toBe(`Plain again ${world.marker}`);
  });
});

describe("changing a Workspace Key", () => {
  it("makes a new version current, moves everything over, keeps the old version until it has settled, then destroys it", async () => {
    const world = await plainWorld();
    const { w, marker, hook } = world;
    await reencryptionJob(only(w));
    const before = await readings(world);
    const a = await admin();
    const stale = await workspaceCipher(w.id);
    expect((await changeWorkspaceKey(a.actor, w.id)).version).toBe(2);
    // The new version is held but does not seal yet, and is found by blind indexes: no process seals with a version
    // that another may not have loaded.
    const waiting = await workspaceCipher(w.id);
    expect(waiting.version).toBe(1);
    expect(waiting.blindIndexes("contacts.email", "x@y.test")).toHaveLength(2);
    expect((await reencryptionJob(only(w))).rowsMoved).toBe(0);
    await expect(changeWorkspaceKey(a.actor, w.id)).rejects.toThrow(Refused);
    // Its time comes: it takes over, and a process holding only version 1 meets values of version 2.
    await db().from("workspace_keys").update({ pending_until: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", w.id).eq("version", 2);
    const run = await reencryptionJob(only(w));
    const fresh = await workspaceCipher(w.id);
    expect(fresh.version).toBe(2);
    const sealedTwo = fresh.seal({ table: "thread_messages", column: "body", row: 1 }, "Hello");
    expect(stale.open({ table: "thread_messages", column: "body", row: 1 }, sealedTwo)).toBeNull();
    expect((await workspaceCipher(w.id)).version).toBe(2);
    expect(run.errors).toBe(0);
    expect(run.rowsMoved + run.rowsSealed).toBeGreaterThan(5);
    // Everything under version 2: columns, JSON words, indexes.
    const { data: ws } = await db().from("widgets").select("title, settings").eq("id", world.finding).single();
    expect(sealedVersion(ws!.title as string)).toBe(2);
    expect(sealedVersion((ws!.settings as { headline: string }).headline)).toBe(2);
    const { data: rows } = await db().from("breakdown_rows").select("label, label_index").eq("workspace_id", w.id);
    expect(sealedVersion(rows![0].label as string)).toBe(2);
    expect(rows![0].label_index).toMatch(/^b1\.2\./);
    const { data: hist } = await db().from("breakdown_history").select("label").eq("workspace_id", w.id);
    expect(hist!.every((h) => sealedVersion(h.label as string) === 2)).toBe(true);
    const { data: ext } = await db().from("webhook_external_ids").select("external_hash").eq("workspace_id", w.id).single();
    expect(ext!.external_hash).toMatch(/^b1\.2\./);
    expect((await db().from("contacts").select("email_index").eq("person_id", world.contact).single()).data!.email_index).toMatch(/^b1\.2\./);
    expect(JSON.stringify(await readings(world))).toBe(JSON.stringify(before));
    expect(await dump(w.id)).not.toContain(marker);
    expect(hook).toBeTruthy();

    // The old version is kept: it has not settled, whatever was moved.
    const kept = async () => (await db().from("workspace_keys").select("version, retired_at").eq("workspace_id", w.id).order("version")).data!;
    expect((await kept()).map((k) => k.version)).toEqual([1, 2]);
    expect((await reencryptionJob(only(w))).keysDestroyed).toBe(0);
    expect((await kept()).map((k) => k.version)).toEqual([1, 2]);

    // Settled, and a scan that began after it: destroyed, and nothing is lost.
    await db().from("workspace_keys").update({ retired_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("workspace_id", w.id).eq("version", 1);
    const last = await reencryptionJob(only(w));
    expect(last.keysDestroyed).toBe(1);
    expect((await kept()).map((k) => k.version)).toEqual([2]);
    expect(JSON.stringify(await readings(world))).toBe(JSON.stringify(before));
  });

  it("moves a value a late process wrote under the old version before the version is destroyed", async () => {
    const world = await plainWorld();
    const { w } = world;
    await reencryptionJob(only(w));
    const old = await workspaceCipher(w.id);
    await changeWorkspaceKey((await admin()).actor, w.id);
    await db().from("workspace_keys").update({ pending_until: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", w.id).eq("version", 2);
    await reencryptionJob(only(w));
    await db().from("workspace_keys").update({ retired_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("workspace_id", w.id).eq("version", 1);
    // A process that still held version 1 wrote a message under it.
    const body = old.seal({ table: "thread_messages", column: "body", row: 987654 }, "Late");
    expect(sealedVersion(body)).toBe(1);
    const { data: action } = await db().from("actions").select("id, asker_id").eq("workspace_id", w.id).limit(1).single();
    const { data: msg } = await db().from("thread_messages").insert({ id: 987654, action_id: action!.id, author_id: action!.asker_id, body, workspace_id: w.id }).select("id").single();
    const run = await reencryptionJob(only(w));
    // Moved to version 2 first, then the version goes: nothing is under it any more.
    expect(run.rowsMoved).toBeGreaterThanOrEqual(1);
    expect(sealedVersion((await db().from("thread_messages").select("body").eq("id", msg!.id).single()).data!.body as string)).toBe(2);
    expect(run.keysDestroyed).toBe(1);
  });

  it("keeps a removed Contact's name reachable: it is moved to the new version before the old one goes, and one nobody can place keeps it alive", async () => {
    const w = await workspace("Ghosts");
    cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
    const owner = await w.person("owner");
    const actor = w.actor(owner);
    const id = await addContact(actor, { name: "Gone Person", email: "gone@example.test" });
    await removeContact(actor, id);
    expect((await db().from("profiles").select("contact_workspace").eq("id", id).single()).data!.contact_workspace).toBe(w.id);
    await reencryptionJob(only(w));
    const a = await admin();
    await changeWorkspaceKey(a.actor, w.id);
    await db().from("workspace_keys").update({ pending_until: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", w.id).eq("version", 2);
    await reencryptionJob(only(w));
    const { data: name } = await db().from("profiles").select("name").eq("id", id).single();
    expect(sealedVersion(name!.name as string)).toBe(2);
    // A name whose Workspace nobody knows (no Contact row, none recorded) may be under any version: nothing is destroyed.
    const ghost = randomUUID();
    const cipher = await workspaceCipher(w.id);
    await db().from("profiles").insert({ id: ghost, name: cipher.seal({ table: "profiles", column: "name", row: ghost }, "Unplaced"), role: "Contact", color: "#000" });
    cleanups.push(async () => { await db().from("profiles").delete().eq("id", ghost); });
    await db().from("workspace_keys").update({ retired_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("workspace_id", w.id).eq("version", 1);
    expect((await reencryptionJob(only(w))).keysDestroyed).toBe(0);
    await db().from("profiles").delete().eq("id", ghost);
    expect((await reencryptionJob(only(w))).keysDestroyed).toBe(1);
    forgetWorkspaceKey(w.id);
    expect((await openNames(w.id, [{ id, name: name!.name }]))[0].name).toBe("Gone Person");
  });

  it("is for Installation Admins, never the demo, and refused without a key; two at once make one version", async () => {
    const w = await workspace("Races");
    cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
    const owner = await w.person("owner");
    await expect(changeWorkspaceKey({ personId: owner }, w.id)).rejects.toThrow(Forbidden);
    const a = await admin();
    await expect(changeWorkspaceKey(a.actor, DEMO_WORKSPACE_ID)).rejects.toThrow(Forbidden);
    await expect(changeWorkspaceKey(a.actor, "not-an-id")).rejects.toThrow(Forbidden);
    await expect(changeWorkspaceKey(a.actor, randomUUID())).rejects.toThrow(Forbidden);
    // No key yet: refused, no key made by this.
    await expect(changeWorkspaceKey(a.actor, w.id)).rejects.toThrow(Refused);
    await workspaceCipher(w.id);
    const both = await Promise.allSettled([changeWorkspaceKey(a.actor, w.id), changeWorkspaceKey(a.actor, w.id)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", w.id).order("version")).data!.map((k) => k.version)).toEqual([1, 2]);
    delete process.env.ZIFFR_SECRETS_KEY;
    await expect(changeWorkspaceKey(a.actor, w.id)).rejects.toThrow(Refused);
    // Recorded by the Workspace's id, never a key.
    const { data: events } = await db().from("installation_audit_events").select("kind, subject").eq("kind", "workspace.key_changed").eq("subject", w.id);
    expect(events).toHaveLength(1);
  });
});

describe("wrapping Workspace Keys again after the Installation key changed", () => {
  it("wraps them under the new key, counts the ones that cannot be opened, and tells the page when none is left", async () => {
    const world = await plainWorld();
    const { w } = world;
    await reencryptionJob(only(w));
    const strangerWs = await workspace("Stranger");
    cleanups.push(async () => { forgetWorkspaceKey(strangerWs.id); await strangerWs.cleanup(); });
    // A key wrapped under an Installation key nobody has any more.
    const lost = await installationKeyWrapper(() => ({ current: Buffer.alloc(32, 9), previous: null })).wrap(strangerWs.id, 1, randomBytes(32));
    await db().from("workspace_keys").insert({ workspace_id: strangerWs.id, version: 1, wrapped: lost.wrapped, wrapper: "installation", wrapped_under: lost.under });
    process.env.ZIFFR_SECRETS_KEY_PREVIOUS = process.env.ZIFFR_SECRETS_KEY;
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 72).toString("base64");
    const run = await reencryptionJob({ only: [] });
    expect(run.rewrapped).toBeGreaterThanOrEqual(1);
    expect(run.rewrapFailed).toBeGreaterThanOrEqual(1);
    const fingerprint = installationKeyFingerprint(Buffer.alloc(32, 72));
    expect((await db().from("workspace_keys").select("wrapped_under").eq("workspace_id", w.id)).data!.every((k) => k.wrapped_under === fingerprint)).toBe(true);
    // The Workspace still opens, with the new key alone.
    delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
    forgetWorkspaceKey(w.id);
    expect((await workspaceCipher(w.id)).sealing).toBe(true);
    expect((await readings(world)).intro).toBe(`Edited ${world.marker}`);
  });
});
