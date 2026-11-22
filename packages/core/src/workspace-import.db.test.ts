// Importing a Workspace Export against the real database (spec 0040, ticket 9): the file becomes a new Workspace through
// the core's ordinary operations, sealed under its own key; a bad file or a stopped job leaves nothing; people are
// held invitations that send nothing until the Owner invites them; nothing of the file is an id or reaches HTML raw.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DashboardTemplateFile } from "@ziffr/pack/dashboard-template-file";
import type { DeckTemplateFile } from "@ziffr/pack/deck-template-file";
import type { WorkflowTemplateFile } from "@ziffr/pack/workflow-template-file";
import type { ThemeFile } from "@ziffr/pack/theme-file";
import type { WorkspaceExportRecord } from "@ziffr/pack/workspace-export";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { workspaceCipher } from "./workspace-keys";
import { writeWorkspaceExportAll } from "./workspace-export-file";
import { importLimits, importStatus, ImportProblem, Labels, startWorkspaceImport, STALE_SECONDS } from "./workspace-import";
import { acceptInvitation, inviteEveryone, invitationFor, openInvitations } from "./invitations";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
const made: string[] = [];
afterEach(async () => {
  for (const id of made.splice(0)) {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    const { data: contacts } = await db().from("contacts").select("person_id").eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
    if (contacts?.length) await db().from("profiles").delete().in("id", contacts.map((c) => c.person_id));
  }
  for (const c of cleanups.splice(0)) await c();
  delete process.env.ZIFFR_CLOUD_KEY;
});

const metricDoc = { format: "ziffr.metric/1", name: "Orders", period: "month", aggregation: "sum", polarity: "higher" } as const;
const themeDoc: ThemeFile = { format: "ziffr.theme/1", name: "Calm", colors: { canvas: "#ffffff", surface: "#f5f5f5", ink: "#111111", muted: "#777777", rule: "#dddddd", accent: "#2255ee", good: "#118833", bad: "#cc2222", band: "#e6eeff", data: ["#2255ee"] }, fonts: { heading: "inter", body: "inter", figures: "inter" }, radius: 6, cards: "flat" };
const dashDoc: DashboardTemplateFile = { format: "ziffr.dashboard-template/1", name: "Sales <b>board</b>", slots: [{ label: "Orders" }], widgets: [{ view: "number", slots: [0], x: 0, y: 0, w: 4, h: 3 }] };
const flowDoc: WorkflowTemplateFile = { format: "ziffr.workflow-template/1", name: "Monthly", dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 1 }, { type: "approve", approvers: 2 }, { type: "publish", lock: false }] };
const deckDoc: DeckTemplateFile = { format: "ziffr.deck-template/1", name: "Review", slots: [{ label: "Orders" }], slides: [{ shapes: [{ shape: "text", x: 10, y: 10, w: 300, text: ["Hello"] }] }] };

/** A sound file of a small Workspace, with the importer's own address among its people. */
const records = (importerEmail: string): WorkspaceExportRecord[] => [
  { kind: "header", format: "ziffr.workspace-export/1", ziffr: "0.40.0", exportedAt: "2026-11-22T10:00:00Z", workspace: { name: "Acme <script>alert(1)</script>", timeZone: "Europe/Berlin", yearStart: 4 } },
  { kind: "group", id: "g1", name: "Sales" },
  { kind: "theme", id: "t1", theme: themeDoc },
  { kind: "person", id: "me", name: "The importer", email: importerEmail, role: "admin", groups: ["g1"] },
  { kind: "person", id: "ada", name: "Ada <i>Lovelace</i>", email: "ada@example.com", role: "member", groups: ["g1"] },
  { kind: "person", id: "gus", name: "Gus", email: "gus@example.com", role: "guest" },
  { kind: "metric", id: "m1", key: "orders", metric: metricDoc, tags: ["sales"], owner: "ada", submitters: ["me", "ada", "gus"] },
  { kind: "metric", id: "m2", key: "revenue", metric: { ...metricDoc, name: "Revenue", polarity: "lower" } },
  { kind: "metric", id: "m3", key: "avg", metric: { ...metricDoc, name: "Average", aggregation: "average", formula: "{revenue} / {orders}" } },
  { kind: "dashboard", id: "d1", dashboard: dashDoc, slots: [["m1"]] },
  { kind: "deck", id: "k1", deck: deckDoc, slots: [["m1"]], theme: "t1" },
  { kind: "workflow", id: "w1", workflow: flowDoc, metrics: ["m1", "m2"] },
  { kind: "share", of: { kind: "dashboard", id: "d1" }, with: { kind: "group", id: "g1" } },
  { kind: "share", of: { kind: "metric", id: "m1" }, with: { kind: "person", id: "ada" } },
  { kind: "target", metric: "m1", period: "2026-04-01", min: 10, max: 20 },
  { kind: "target", metric: "m2", period: "2026-04-01", max: 7 },
  { kind: "projection", metric: "m1", period: "2027-04-01", value: 12.5 },
  { kind: "value", metric: "m1", period: "2026-04-01", value: 14, recordedAt: "2026-05-01T08:00:00Z", source: "slack", submittedBy: "Ada", breakdown: [{ label: "Germany", value: 9 }, { label: "France", value: 5 }] },
  { kind: "value", metric: "m1", period: "2026-07-01", value: 21.25 },
  { kind: "value", metric: "m3", period: "2026-04-01", value: 3 },
];

/** Writes the file to a temporary path, as the upload route does. */
async function fileOf(rs: WorkspaceExportRecord[]) {
  const path = join(tmpdir(), `ziffr-import-test-${randomUUID()}`);
  await writeFile(path, await writeWorkspaceExportAll(rs));
  return path;
}
async function importer(email = `owner-${randomUUID().slice(0, 8)}@example.test`) {
  const w = await workspace("Home");
  cleanups.push(w.cleanup);
  const person = await w.person("owner", { email });
  return { w, person, email };
}
async function run(person: string, rs: WorkspaceExportRecord[]) {
  const { id, done } = await startWorkspaceImport(person, await fileOf(rs));
  await done;
  const status = (await importStatus(person, id))!;
  if (status.workspaceId) made.push(status.workspaceId);
  return status;
}
const metricsOf = async (ws: string) => (await openRows("metrics", ws, (await db().from("metrics").select("id, slug, name, owner_id, formula, workflow_id, period").eq("workspace_id", ws).order("id")).data ?? [])) as { id: number; slug: string; name: string; owner_id: string; formula: string | null; workflow_id: number | null }[];

describe("a sound file", () => {
  it("becomes a new Workspace the person owns, written through the core's operations", async () => {
    const { w, person, email } = await importer();
    const status = await run(person, records(email));
    expect(status).toMatchObject({ status: "done", problem: null, workspaceName: "Acme <script>alert(1)</script>" });
    const ws = status.workspaceId!;
    expect(status.counts).toMatchObject({ groups: 1, themes: 1, people: 3, metrics: 3, dashboards: 1, decks: 1, workflows: 1, shares: 2, targets: 2, projections: 1, values: 2, derivedValuesSkipped: 1 });
    // Open for use, with the person as its Owner and the file's settings.
    const { data: row } = await db().from("workspaces").select("name, importing_at, time_zone, year_start_month, keyed_at").eq("id", ws).single();
    expect(row).toMatchObject({ name: "Acme <script>alert(1)</script>", importing_at: null, time_zone: "Europe/Berlin", year_start_month: 4 });
    expect((await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", person).single()).data?.role).toBe("owner");
    const metrics = await metricsOf(ws);
    expect(metrics).toHaveLength(3);
    // Every Metric is the importer's; the Derived one has its formula by the new slugs; the Workflow was set on the plain ones.
    expect(metrics.every((m) => m.owner_id === person)).toBe(true);
    const [orders, revenue, avg] = metrics;
    expect(avg.formula).toBe(`{${revenue.slug}} / {${orders.slug}}`);
    const { data: flows } = await db().from("workflows").select("id, config").eq("workspace_id", ws);
    expect(flows).toHaveLength(1);
    expect(metrics.filter((m) => m.workflow_id === flows![0].id).map((m) => m.name)).toEqual(["Orders", "Revenue"]);
    // The approvers are the Owner until people join.
    expect(JSON.stringify(flows![0].config)).toContain(person);
    // The values, sealed under the new key, with their Breakdown and recording time; none for the Derived Metric.
    const cipher = await workspaceCipher(ws);
    const { data: obs } = await db().from("observations").select("id, metric_id, period_start, value, value_sealed, imported, source, created_at, submitter_id").eq("workspace_id", ws).order("period_start");
    expect(obs).toHaveLength(2);
    expect(obs!.every((o) => o.imported && o.submitter_id === null)).toBe(true);
    if (cipher.sealing) expect(obs!.every((o) => o.value === null && typeof o.value_sealed === "string")).toBe(true);
    const opened = await openRows("observations", ws, obs!);
    expect(opened.map((o) => o.value)).toEqual([14, 21.25]);
    // Sealed under this Workspace's own key: another Workspace's key (the importer's own) opens none of it.
    if (cipher.sealing) expect((await openRows("observations", w.id, obs!)).map((o) => o.value)).toEqual([null, null]);
    expect(new Date(obs![0].created_at as string).toISOString()).toBe("2026-05-01T08:00:00.000Z");
    const { data: parts } = await db().from("breakdown_rows").select("id, label, label_index, value, value_sealed").eq("workspace_id", ws).order("position");
    expect((await openRows("breakdown_rows", ws, parts!)).map((p) => [p.label, p.value])).toEqual([["Germany", 9], ["France", 5]]);
    // A lower-is-better Metric's target is the file's upper end.
    const { data: targets } = await db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws);
    expect(targets).toHaveLength(3);
    // The tag, the Group and its Share, the dashboard and the deck with its template waiting to be laid out.
    expect((await db().from("groups").select("name").eq("workspace_id", ws).eq("name", "Sales")).data).toHaveLength(1);
    expect((await db().from("dashboards").select("id").eq("workspace_id", ws)).data).toHaveLength(1);
    const { data: decks } = await db().from("decks").select("document, theme_id").eq("workspace_id", ws);
    expect(decks![0].document).toMatchObject({ importSeed: { fills: [[orders.id]] } });
    expect(decks![0].theme_id).not.toBeNull();
    // The importer is in the Group the file named for them, and is a Submitter; nobody is invited by an email of theirs.
    const { data: inGroup } = await db().from("group_members").select("user_id").eq("workspace_id", ws).eq("user_id", person);
    expect(inGroup).toHaveLength(1);
    const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", orders.id);
    expect(tokens!.map((t) => t.submitter_id)).toEqual([person]);
    // The audit line says it was imported.
    expect((await db().from("audit_events").select("kind").eq("workspace_id", ws).eq("kind", "workspace.imported")).data).toHaveLength(1);
  });

  it("holds the other people as invitations that send nothing and cannot be accepted, until the Owner invites everyone", async () => {
    const { w, person, email } = await importer();
    const status = await run(person, records(email));
    const ws = status.workspaceId!;
    const actor = { personId: person, workspaceId: ws, role: "owner" as const };
    const held = await openInvitations(actor);
    expect(held.map((i) => [i.email, i.role, i.name, Boolean(i.held_at)]).sort()).toEqual([["ada@example.com", "member", "Ada <i>Lovelace</i>", true], ["gus@example.com", "guest", "Gus", true]]);
    expect(JSON.stringify(held)).not.toMatch(/token|import_plan|groups/);
    const { data: raw } = await db().from("invitations").select("token, email, email_sends").eq("workspace_id", ws);
    expect(raw!.every((r) => r.email_sends === 0)).toBe(true);
    const ada = raw!.find((r) => r.email === "ada@example.com")!;
    // Not usable while held: its page says so, and joining is refused.
    expect((await invitationFor(ada.token as string))!.usable).toBe(false);
    const stranger = await w.person("member", { email: "ada@example.com" });
    await expect(acceptInvitation({ personId: stranger, verifiedEmail: "ada@example.com" }, ada.token as string)).rejects.toThrow(/does not work any more/);
    // Only the Owner invites everyone; mail is off here, so nothing goes out but every invitation is released.
    await expect(inviteEveryone({ ...actor, role: "admin" })).rejects.toThrow(/Only the Owner/);
    expect(await inviteEveryone(actor)).toEqual({ released: 2, emailed: 0 });
    expect(await inviteEveryone(actor)).toEqual({ released: 0, emailed: 0 });
    expect((await invitationFor(ada.token as string))!.usable).toBe(true);
    // Joining applies what the file said of Ada: her Group, what was shared with her, the Metric she owned and sent values for.
    await acceptInvitation({ personId: stranger, verifiedEmail: "ada@example.com" }, ada.token as string);
    const orders = (await metricsOf(ws))[0];
    expect((await db().from("metrics").select("owner_id").eq("id", orders.id).single()).data?.owner_id).toBe(stranger);
    expect((await db().from("tokens").select("submitter_id").eq("metric_id", orders.id).eq("submitter_id", stranger)).data).toHaveLength(1);
    expect((await db().from("group_members").select("user_id").eq("workspace_id", ws).eq("user_id", stranger)).data).toHaveLength(1);
    expect((await db().from("shares").select("object_type").eq("workspace_id", ws).eq("user_id", stranger).eq("object_type", "metric")).data).toHaveLength(1);
  });

  it("never lets the Workspace's name or a person's name into an email as markup", async () => {
    const { person, email } = await importer();
    const status = await run(person, records(email));
    const sent: { text: string; html?: string; subject: string }[] = [];
    const saved = { smtp: process.env.ZIFFR_SMTP_URL, from: process.env.ZIFFR_MAIL_FROM, site: process.env.ZIFFR_SITE_URL };
    Object.assign(process.env, { ZIFFR_SMTP_URL: "smtp://localhost:1", ZIFFR_MAIL_FROM: "ziffr@example.test", ZIFFR_SITE_URL: "https://ziffr.example.test" });
    try {
      await inviteEveryone({ personId: person, workspaceId: status.workspaceId!, role: "owner" }, async (m) => { sent.push(m); return { messageId: "x" }; });
    } finally {
      for (const [k, v] of [["ZIFFR_SMTP_URL", saved.smtp], ["ZIFFR_MAIL_FROM", saved.from], ["ZIFFR_SITE_URL", saved.site]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    expect(sent).toHaveLength(2);
    for (const m of sent) {
      expect(m.html ?? "").not.toContain("<script>");
      expect(m.html ?? "").not.toMatch(/<i>Lovelace/);
      expect(m.subject).not.toContain("<script>");
    }
  });
});

describe("a file that is refused", () => {
  it("creates nothing: the problem names the line and no Workspace or key is left", async () => {
    const { person, email } = await importer();
    const before = (await db().from("workspaces").select("id", { count: "exact", head: true })).count;
    const lines = (await writeWorkspaceExportAll(records(email), { gzip: false })).toString().split("\n");
    const badPath = join(tmpdir(), `ziffr-import-test-${randomUUID()}`);
    await writeFile(badPath, lines.map((l) => (l.includes('"value":14,') ? l.replace('"metric":"m1"', '"metric":"nobody"') : l)).join("\n"));
    const badJob = await startWorkspaceImport(person, badPath);
    await badJob.done;
    const status = (await importStatus(person, badJob.id))!;
    expect(status.status).toBe("failed");
    expect(status.problem).toMatch(/^line \d+: metric names “nobody”/);
    expect((await db().from("workspaces").select("id", { count: "exact", head: true })).count).toBe(before);
    expect(status.workspaceId).toBeNull();
    // A hostile file with a field that names a secret, and one that is not a file at all.
    const hostile = (await writeWorkspaceExportAll(records(email), { gzip: false })).toString().split("\n");
    hostile[1] = hostile[1].replace('"name"', '"apiKey":"s","name"');
    const path = join(tmpdir(), `ziffr-import-test-${randomUUID()}`);
    await writeFile(path, hostile.join("\n"));
    const { id, done } = await startWorkspaceImport(person, path);
    await done;
    expect((await importStatus(person, id))!.problem).toMatch(/secret, a key or a link/);
    const junk = join(tmpdir(), `ziffr-import-test-${randomUUID()}`);
    await writeFile(junk, "this is not a Workspace Export");
    const j = await startWorkspaceImport(person, junk);
    await j.done;
    expect((await importStatus(person, j.id))!.status).toBe("failed");
  });

  it("is refused up front when it holds more Metrics than the Workspace Limit allows, saying how many", async () => {
    const { person, email } = await importer();
    const saved = process.env.ZIFFR_DEFAULT_METRICS_LIMIT;
    process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "2";
    try {
      const status = await run(person, records(email));
      expect(status.status).toBe("failed");
      expect(status.problem).toMatch(/holds 3 Metrics.*Workspace Limit is 2/);
      expect(status.workspaceId).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.ZIFFR_DEFAULT_METRICS_LIMIT; else process.env.ZIFFR_DEFAULT_METRICS_LIMIT = saved;
    }
  });

  it("is not offered on hosted Ziffr, and the file is deleted", async () => {
    const { person, email } = await importer();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(40);
    const path = await fileOf(records(email));
    await expect(startWorkspaceImport(person, path)).rejects.toThrow(/hosted Ziffr/);
    await expect(writeFile(path, "", { flag: "wx" })).resolves.toBeUndefined();
  });

  it("is one import at a time per person", async () => {
    const { person, email } = await importer();
    const first = await startWorkspaceImport(person, await fileOf(records(email)));
    await expect(startWorkspaceImport(person, await fileOf(records(email)))).rejects.toThrow(/importing a Workspace already/);
    await first.done;
    const status = (await importStatus(person, first.id))!;
    if (status.workspaceId) made.push(status.workspaceId);
    expect(await importStatus(person, "00000000-0000-0000-0000-000000000000")).toBeNull();
    // Another person's import is not theirs to read.
    const other = await importer();
    expect(await importStatus(other.person, first.id)).toBeNull();
  });
});

describe("a job that stopped", () => {
  it("is ended and undone: the half-made Workspace is deleted with its key", async () => {
    const { person } = await importer();
    const { data: ws } = await db().from("workspaces").insert({ name: "Half", importing_at: new Date().toISOString() }).select("id").single();
    await db().from("memberships").insert({ workspace_id: ws!.id, user_id: person, role: "owner" });
    await workspaceCipher(ws!.id as string);
    const old = new Date(Date.now() - (STALE_SECONDS + 5) * 1000).toISOString();
    const { data: job } = await db().from("workspace_imports").insert({ created_by: person, workspace_id: ws!.id, status: "importing", updated_at: old }).select("id").single();
    const status = await importStatus(person, job!.id as string);
    expect(status).toMatchObject({ status: "failed" });
    expect(status!.problem).toMatch(/Nothing was kept/);
    expect((await db().from("workspaces").select("id").eq("id", ws!.id)).data).toHaveLength(0);
    expect((await db().from("workspace_keys").select("workspace_id").eq("workspace_id", ws!.id)).data).toHaveLength(0);
    // The key's end is on the Installation's audit, by id.
    expect((await db().from("installation_audit_events").select("kind").eq("kind", "workspace.key_destroyed").eq("subject", ws!.id as string)).data).toHaveLength(1);
  });

  it("never reaches a Workspace that is not being imported", async () => {
    const { person, w } = await importer();
    const old = new Date(Date.now() - (STALE_SECONDS + 5) * 1000).toISOString();
    const { data: job } = await db().from("workspace_imports").insert({ created_by: person, workspace_id: w.id, status: "importing", updated_at: old }).select("id").single();
    expect(await importStatus(person, job!.id as string)).toMatchObject({ status: "failed" });
    expect((await db().from("workspaces").select("id").eq("id", w.id)).data).toHaveLength(1);
  });
});

describe("labels and sizes", () => {
  it("replaces a label only through its map: a missing one throws and is never used as an id", () => {
    const l = new Labels<number>("Metric");
    // Labels that look like ids, numbers or Object's own names are only labels.
    for (const [i, label] of ["1", "42", "00000000-0000-0000-0000-000000000000", "__proto__", "constructor", "toString"].entries()) l.set(label, 100 + i);
    expect(l.need("42")).toBe(101);
    expect(l.need("__proto__")).toBe(103);
    for (const missing of ["43", "hasOwnProperty", "", "m9"]) expect(() => l.need(missing)).toThrow(ImportProblem);
    expect(() => l.set("1", 5)).toThrow(/listed twice/);
  });
  it("reads the sizes from the settings, within bounds", () => {
    expect(importLimits({})).toEqual({ fileBytes: 200 * 1024 * 1024, textBytes: 1024 * 1024 * 1024 });
    expect(importLimits({ ZIFFR_IMPORT_MAX_FILE_MB: "5", ZIFFR_IMPORT_MAX_TEXT_MB: "50" })).toEqual({ fileBytes: 5 * 1024 * 1024, textBytes: 50 * 1024 * 1024 });
    expect(importLimits({ ZIFFR_IMPORT_MAX_FILE_MB: "-1", ZIFFR_IMPORT_MAX_TEXT_MB: "1e99" }).fileBytes).toBe(200 * 1024 * 1024);
  });
});
