// The Audit Log through the core, against the real database (spec 0008): what is recorded, who reads it, what they
// may see of it, the filters, the CSV export, and that the database keeps it add-only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { db } from "./db";
import { AUDIT_EXPORTS_PER_HOUR, AuditExportLimit, auditLog, exportAuditLog, recordAudit, recordDeckExport, recordSignIn } from "./audit-log";
import { acceptInvitation, createInviteLink, decideJoinRequest, inviteByEmail, revokeInvitation, setJoinDomain, setRole } from "./invitations";
import { createGroup, deleteGroup, renameGroup, setGroupMember, addContact, removeContact } from "./team";
import { removeMember } from "./handover";
import { share, shareWithGroup } from "./sharing";
import { createViewLink, revokeViewLink } from "./view-links";
import { createDashboard } from "./dashboards";
import { createAccessKey, revokeAccessKey } from "./access-keys";
import { createMetric, deleteMetric } from "./metrics";
import { approveValue, closeWorkflowPeriod, lockPeriod, saveWorkflow, sendValueBack, setMetricWorkflow } from "./workflows";
import { decideCorrection, submitValue } from "./submissions";
import { setWorkspaceClock } from "./workspace-clock";
import { DEMO_WORKSPACE_ID } from "./team";
import { renameWorkspace, setAnswerLanguages, setNumberStyle, setWorkspaceProfile } from "./workspace-settings";
import { setYearStart } from "./fiscal-year";
import { workspace, opened } from "./test/db-fixtures";
import { JANUARY, periodStart } from "./periods";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const month = periodStart(new Date(), "month", JANUARY);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const quiet = { recordCreated: async () => {}, promptSubmitter: async () => {} };
const stored = async (wsId: string) => opened("audit_events", wsId, (await db().from("audit_events").select("*").eq("workspace_id", wsId).order("id")).data);
const kinds = async (wsId: string) => (await stored(wsId)).map((e) => e.kind);
async function text(lines: AsyncIterable<string>) { let s = ""; for await (const l of lines) s += l; return s; }

describe("recording", () => {
  it("records members, invitations, joining, Groups, Contacts and settings, with who, what and the details", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const owner = w.actor(sara);
    await setRole(owner, ben, "admin");
    await setRole(owner, ben, "admin");
    const inviteToken = (await inviteByEmail(owner, { email: "new@audit.test", role: "member" })).token;
    await createInviteLink(owner, "guest");
    const { data: open } = await db().from("invitations").select("id, token").eq("workspace_id", w.id).order("id");
    await revokeInvitation(owner, open![1].id);
    const newcomer = await w.person("guest");
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", newcomer);
    await acceptInvitation({ personId: newcomer, verifiedEmail: "new@audit.test" }, inviteToken);
    await setJoinDomain(owner, "sara@company-audit.test", true);
    await setJoinDomain(owner, null, false);
    const asker = await w.person("member");
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", asker);
    const { data: jr } = await db().from("join_requests").insert({ workspace_id: w.id, person_id: asker }).select("id").single();
    await decideJoinRequest(owner, jr!.id, false);
    await createGroup(owner, "Sales");
    const { data: g } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Sales").single();
    await renameGroup(owner, g!.id, "Sales DACH");
    await setGroupMember(owner, g!.id, ann, true);
    await setGroupMember(owner, g!.id, ann, true);
    await setGroupMember(owner, g!.id, ann, false);
    await deleteGroup(owner, g!.id);
    const cleo = await addContact(owner, { name: "Cleo", email: "cleo@contact.test" });
    await removeContact(owner, cleo);
    await setWorkspaceClock(owner, { timeZone: "Europe/Berlin", runHour: 7 });
    await removeMember(owner, ann, sara);
    await renameWorkspace(owner, "Audit Co");
    await setWorkspaceProfile(owner, { industry: "saas", employeeBand: null });
    await setYearStart(owner, 4);
    await setNumberStyle(owner, "1.234,5");
    await setAnswerLanguages(owner, ["en", "fr"]);

    expect(await kinds(w.id)).toEqual([
      "member.role_changed", "invitation.created", "invitation.created", "invitation.revoked", "invitation.accepted",
      "domain_joining.on", "domain_joining.off", "join_request.declined",
      "group.created", "group.renamed", "group.member_added", "group.member_removed", "group.deleted",
      "contact.added", "contact.removed", "workspace.clock_changed", "member.removed",
      "workspace.renamed", "workspace.profile_changed", "workspace.year_start_changed", "workspace.number_style_changed", "workspace.answer_languages_changed",
    ]);
    const rows = await stored(w.id);
    expect(rows[0]).toMatchObject({ actor_id: sara, object_type: "person", object_id: ben, details: { from: "member", to: "admin" } });
    expect(rows[4]).toMatchObject({ actor_id: newcomer, details: { role: "member" } });
    expect(rows[5].details).toEqual({ domain: "company-audit.test" });
    expect(rows[9]).toMatchObject({ object_name: "Sales DACH", details: { from: "Sales", to: "Sales DACH" } });
    expect(rows[15].details).toEqual({ from_time_zone: "UTC", to_time_zone: "Europe/Berlin", from_run_hour: 8, to_run_hour: 7, from_week_start: 1, to_week_start: 1 });
    expect(rows[16]).toMatchObject({ object_id: ann, details: { role: "member", successor_id: sara } });
    expect(rows[17].details).toMatchObject({ to: "Audit Co" });
    expect(rows[18].details).toEqual({ from_industry: null, to_industry: "saas" });
    expect(rows[19].details).toEqual({ from: 1, to: 4 });
    // The Workspace has no country, so the style it had was the default (ticket #184).
    expect(rows[20].details).toEqual({ from: null, followed: "default", to: "1.234,5" });
    // Never a secret: no invitation token, no Contact's address.
    const all = JSON.stringify(rows);
    expect(all).not.toContain(inviteToken);
    expect(all).not.toContain(open![1].token);
    expect(all).not.toContain("cleo@contact.test");
  });

  it("records Shares, View Links, Access Keys and Metrics, never a key's secret or a link's token", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const owner = w.actor(sara);
    const m = await createMetric(owner, { name: "Revenue" }, quiet);
    await share(owner, "metric", m.id, ben, "viewer");
    await share(owner, "metric", m.id, ben, "viewer");
    await share(owner, "metric", m.id, ben, null);
    await createGroup(owner, "Board");
    const { data: g } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Board").single();
    const d = await createDashboard(owner, "Monthly");
    await shareWithGroup(owner, "dashboard", d, g!.id, "editor");
    const linkToken = await createViewLink(owner, "dashboard", d, { label: "Investors", expires: inDays(5), frozen: false });
    const { data: link } = await db().from("view_links").select("id").eq("token", linkToken).single();
    await revokeViewLink(owner, link!.id);
    await revokeViewLink(owner, link!.id);
    const key = await createAccessKey(w.actor(ben, "member"), { name: "Feed", scopes: ["metrics:read"], expiresOn: inDays(10) });
    await revokeAccessKey(owner, key.id);
    const keyActor: KeyActor = { ...w.actor(ben, "member"), key: { id: String(key.id), scopes: ["metrics:write"] } };
    await createMetric(w.actor(ben, "member"), { name: "Leads" }, quiet, { accessKeyId: Number(keyActor.key.id) });

    expect(await kinds(w.id)).toEqual([
      "metric.created", "share.granted", "share.removed", "group.created", "share.granted", "view_link.created", "view_link.revoked",
      "access_key.created", "access_key.revoked", "metric.created",
    ]);
    const rows = await stored(w.id);
    expect(rows[1]).toMatchObject({ object_type: "metric", object_id: String(m.id), object_name: "Revenue", details: { to_type: "person", to_id: ben, role: "viewer" } });
    expect(rows[4]).toMatchObject({ object_type: "dashboard", details: { to_type: "group", to_name: "Board", role: "editor" } });
    expect(rows[5].details).toMatchObject({ link_id: link!.id, frozen: false, expires_on: inDays(5) });
    expect(rows[7]).toMatchObject({ actor_id: ben, object_name: "Feed", details: { scopes: ["metrics:read"] } });
    expect(rows[9]).toMatchObject({ access_key_id: key.id, details: { key_name: "Feed" } });
    const all = JSON.stringify(rows);
    expect(all).not.toContain(linkToken);
    expect(all).not.toContain(key.secret.slice(3));
  });

  it("records Workflows, Locks, Approvals and Corrections by period, never the value or the comment", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara, { target_max: 10, name: "Cash" }); const code = await w.token(m.id, ann);
    const wf = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: false }] });
    await setMetricWorkflow(w.actor(sara), m.id, wf);
    await submitValue({ source: "web_form", sender: code, text: "777" });
    const { data: task } = await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval").single();
    await sendValueBack(w.actor(ben, "member"), task!.id, "Looks like a typo, secret-comment");
    await submitValue({ source: "web_form", sender: code, text: "888" });
    const { data: tasks } = await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval").eq("status", "open");
    await approveValue(w.actor(ben, "member"), tasks![0].id);
    await lockPeriod(w.actor(sara), m.id, month, true);
    await lockPeriod(w.actor(sara), m.id, month, false, "a private reason");
    await closeWorkflowPeriod(w.actor(sara), wf, month);

    const ks = await kinds(w.id);
    expect(ks).toEqual(["metric.workflow_set", "approval.sent_back", "approval.given", "period.locked", "period.unlocked", "period.closed"]);
    const rows = await stored(w.id);
    expect(rows[0].details).toMatchObject({ workflow_id: wf, workflow_name: "Close" });
    expect(rows[2]).toMatchObject({ actor_id: ben, object_type: "metric", object_id: String(m.id), details: { period: month } });
    // What an event says, not its ids or times: those can hold the digits 777 by chance.
    const all = JSON.stringify(rows.map((r) => [r.details, r.object_name, r.actor_name]));
    for (const secret of ["777", "888", "secret-comment", "private reason"]) expect(all).not.toContain(secret);
  });

  it("deletes a Metric only for its owner, never while something uses it, and records it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ada = await w.person("admin");
    const m = await createMetric(w.actor(ben, "member"), { name: "Old leads" }, quiet);
    const obs = await w.value(m.id, month, 7);
    // A value with a Breakdown, both changed once, so there is history of each.
    await db().from("breakdown_rows").insert({ observation_id: obs, label: "Shop", value: 3, position: 0, workspace_id: w.id });
    await db().from("breakdown_rows").update({ value: 4 }).eq("observation_id", obs);
    await db().from("observations").update({ value: 8 }).eq("id", obs);
    await expect(deleteMetric(w.actor(sara), m.id, "Old leads")).rejects.toEqual(forbidden);
    await expect(deleteMetric({ ...w.actor(ben, "member"), workspaceId: (await ws("Other")).id }, m.id, "Old leads")).rejects.toEqual(forbidden);
    await expect(deleteMetric(w.actor(ben, "member"), m.id, "old leads")).rejects.toThrow(/Type the Metric's name/);
    const derived = await w.metric(ben, { name: "Twice", formula: `{${m.slug}} * 2` });
    await expect(deleteMetric(w.actor(ben, "member"), m.id, "Old leads")).rejects.toThrow(/computed from it/);
    await db().from("metrics").delete().eq("id", derived.id);
    const d = await createDashboard(w.actor(ben, "member"), "Board");
    const { data: widget } = await db().from("widgets").insert({ owner_id: ben, dashboard_id: d, template: "number", metric_ids: [m.id], settings: {}, x: 0, y: 0, w: 4, h: 3, workspace_id: w.id }).select("id").single();
    await expect(deleteMetric(w.actor(ben, "member"), m.id, "Old leads")).rejects.toThrow(/shown in 1 widget/);
    await db().from("widgets").delete().eq("id", widget!.id);
    expect(await deleteMetric(w.actor(ben, "member"), m.id, "Old leads")).toEqual({ values: 1 });
    expect((await db().from("metrics").select("id").eq("id", m.id)).data).toEqual([]);
    expect((await db().from("observations").select("id").eq("metric_id", m.id)).data).toEqual([]);
    // Its values and their history went with it, in every workspace: none was filed under the demo (spec review).
    expect((await db().from("observation_history").select("id").eq("metric_id", m.id)).data).toEqual([]);
    expect((await db().from("breakdown_history").select("id").eq("observation_id", obs)).data).toEqual([]);
    expect((await db().from("breakdown_rows").select("id").eq("observation_id", obs)).data).toEqual([]);
    // Its deleter keeps the name; an Admin who never saw it learns only that a Metric was deleted.
    await w.setRole(ben, "admin");
    expect((await auditLog(w.actor(ben, "admin"))).events[0]).toMatchObject({ kind: "metric.deleted", objectName: "Old leads", details: { values: 1 } });
    expect((await auditLog(w.actor(ada, "admin"))).events[0]).toMatchObject({ kind: "metric.deleted", objectName: null, hidden: true });
  });

  it("records a decided Correction without its value", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ben);
    const fx = { notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) };
    await submitValue({ source: "web_form", sender: code, text: "5" }, fx);
    await w.lock(m.id, month);
    await submitValue({ source: "web_form", sender: code, text: "4242.5" }, fx);
    const actionId = (fx.notifyCorrection.mock.calls[0] as unknown as [{ actionId: number }])[0].actionId;
    const { data: msg } = await db().from("thread_messages").select("id").eq("action_id", actionId).single();
    await decideCorrection(w.actor(sara), msg!.id, true, { notifyDecision: async () => {}, afterValue: async () => [] });
    const rows = await stored(w.id);
    expect(rows.map((r) => r.kind)).toEqual(["correction.accepted"]);
    expect(rows[0].details).toEqual({ period: month, proposed_by: ben, action_id: actionId });
    // A value no slug or id can hold (they have no point): the Audit Log never holds a value.
    expect(JSON.stringify(rows)).not.toContain("4242.5");
  });

  it("records sign-ins in each of the person's workspaces, deck exports only for decks they see, and nothing in the demo", async () => {
    const a = await ws("A"); const b = await ws("B"); const sara = await a.person("owner");
    await db().from("memberships").insert({ workspace_id: b.id, user_id: sara, role: "member" });
    await recordSignIn(sara);
    expect(await kinds(a.id)).toEqual(["person.signed_in"]);
    expect(await kinds(b.id)).toEqual(["person.signed_in"]);
    const { data: deck } = await db().from("decks").insert({ name: "Q4", owner_id: sara, workspace_id: a.id }).select("id").single();
    const ben = await a.person("member");
    await expect(recordDeckExport(a.actor(ben, "member"), deck!.id, "pptx")).rejects.toEqual(forbidden);
    await recordDeckExport(a.actor(sara), deck!.id, "pdf");
    expect((await stored(a.id)).at(-1)).toMatchObject({ kind: "export.deck", object_name: "Q4", details: { format: "pdf" } });
    const before = (await db().from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count;
    await recordAudit(DEMO_WORKSPACE_ID, "sara", { kind: "group.created" });
    expect((await db().from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe(before);
  });

  it("never fails the action when recording fails", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordAudit(w.id, sara, { kind: "Not A Kind" as never })).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/could not record Not A Kind/));
    spy.mockRestore();
    expect(await stored(w.id)).toEqual([]);
  });
});

describe("reading", () => {
  it("is for Owners and Admins of the workspace only, never Members, Guests, keys or another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ben = await w.person("member"); const gus = await w.person("guest");
    await createGroup(w.actor(sara), "Ops");
    expect((await auditLog(w.actor(sara))).events.map((e) => e.kind)).toEqual(["group.created"]);
    expect((await auditLog(w.actor(ada, "admin"))).events.map((e) => e.kind)).toEqual(["group.created"]);
    await expect(auditLog(w.actor(ben, "member"))).rejects.toEqual(forbidden);
    await expect(auditLog(w.actor(gus, "guest"))).rejects.toEqual(forbidden);
    await expect(exportAuditLog(w.actor(ben, "member"))).rejects.toEqual(forbidden);
    const key = { ...w.actor(sara), key: { id: "1", scopes: ["metrics:read"] } } as unknown as Parameters<typeof auditLog>[0];
    await expect(auditLog(key)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    expect((await auditLog(other.actor(zoe))).events).toEqual([]);
  });

  it("names a Metric, dashboard or deck only for readers who see it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ada = await w.person("admin");
    const m = await createMetric(w.actor(ben, "member"), { name: "Layoffs 2027" }, quiet);
    await share(w.actor(ben, "member"), "metric", m.id, sara, "viewer");
    const forAdmin = (await auditLog(w.actor(ada, "admin"))).events;
    expect(forAdmin.map((e) => [e.kind, e.objectName, e.hidden])).toEqual([["share.granted", null, true], ["metric.created", null, true]]);
    expect(JSON.stringify(forAdmin)).not.toContain("Layoffs");
    // Nor whom it was shared with: details of what the reader does not see stay out too.
    expect(forAdmin.map((e) => e.details)).toEqual([{}, {}]);
    const forOwner = (await auditLog(w.actor(sara))).events;
    expect(forOwner.map((e) => e.objectName)).toEqual(["Layoffs 2027", "Layoffs 2027"]);
    const csv = await text((await exportAuditLog(w.actor(ada, "admin"))).lines);
    expect(csv).not.toContain("Layoffs");
  });

  it("filters by person, kind, object and dates, and drops what it does not know", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin");
    await createGroup(w.actor(sara), "One");
    await createGroup(w.actor(ada, "admin"), "Two");
    const { data: two } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Two").single();
    await renameGroup(w.actor(sara), two!.id, "Deux");
    const log = (f: Record<string, unknown>) => auditLog(w.actor(sara), f).then((r) => r.events.map((e) => `${e.kind}:${e.objectName}`));
    expect(await log({ person: ada })).toEqual(["group.created:Two"]);
    expect(await log({ kind: "group.renamed" })).toEqual(["group.renamed:Deux"]);
    expect(await log({ kind: "group" })).toHaveLength(3);
    expect(await log({ type: "group", id: String(two!.id) })).toEqual(["group.renamed:Deux", "group.created:Two"]);
    const today = new Date().toISOString().slice(0, 10);
    expect(await log({ from: today, to: today })).toHaveLength(3);
    expect(await log({ from: inDays(1) })).toEqual([]);
    expect(await log({ to: inDays(-2) })).toEqual([]);
    // Nonsense is dropped, never passed to a query.
    expect(await log({ person: "x' or 1=1 --", kind: "drop table", type: "secrets", from: "2026-02-31", to: "soon" })).toHaveLength(3);
  });

  it("pages through the log, newest first", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await db().from("audit_events").insert(Array.from({ length: 130 }, (_, i) => ({ workspace_id: w.id, actor_id: sara, actor_name: "Sara", kind: "group.created", object_type: "group", object_id: String(i), object_name: `G${i}` })));
    const first = await auditLog(w.actor(sara));
    expect(first.events).toHaveLength(100);
    expect(first.events[0].objectName).toBe("G129");
    const second = await auditLog(w.actor(sara), {}, { before: first.next });
    expect(second.events).toHaveLength(30);
    expect(second.next).toBeNull();
  });
});

describe("exporting", () => {
  it("writes CSV that a spreadsheet cannot run, and records the export first", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await createGroup(w.actor(sara), "=HYPERLINK(\"http://evil.test\")");
    await createGroup(w.actor(sara), "@SUM(A1)");
    await createGroup(w.actor(sara), "Say \"hi\", folks");
    const { filename, lines } = await exportAuditLog(w.actor(sara), { kind: "group" });
    expect(filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
    expect((await stored(w.id)).at(-1)).toMatchObject({ kind: "export.audit_log", details: { kind: "group", format: "csv" } });
    const csv = await text(lines);
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe('"time_utc","person","person_id","kind","what","object_type","object_id","object_name","details"');
    expect(rows).toHaveLength(4);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).toContain(`"Say ""hi"", folks"`);
    expect(csv).not.toMatch(/(^|,)"[=+\-@]/m);
  });
});

describe("keeping", () => {
  it("is add-only in the database: no change, no backdating, no removal before two years, gone with its workspace", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await createGroup(w.actor(sara), "Kept");
    const { data: row } = await db().from("audit_events").select("id").eq("workspace_id", w.id).single();
    expect((await db().from("audit_events").update({ actor_name: "Someone else" }).eq("id", row!.id)).error?.message).toMatch(/add-only/);
    expect((await db().from("audit_events").delete().eq("id", row!.id)).error?.message).toMatch(/add-only/);
    // A backdated event gets the database's time, so it cannot be passed off as past the retention and removed.
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Old", kind: "group.created", at: new Date(Date.now() - 800 * 86400000).toISOString() });
    const old = (await stored(w.id)).find((r) => r.actor_name === "Old")!;
    expect(Date.now() - new Date(old.at).getTime()).toBeLessThan(3_600_000);
    expect((await db().from("audit_events").delete().eq("id", old.id)).error?.message).toMatch(/add-only/);
    await createGroup(w.actor(sara), "Next");
    expect(await stored(w.id)).toHaveLength(3);
    await db().from("workspaces").delete().eq("id", w.id);
    expect(await stored(w.id)).toEqual([]);
  });
});

describe("export limit (spec 0009)", () => {
  it("refuses the eleventh export of a workspace within an hour", async () => {
    const w = await ws(); const sara = await w.person("owner");
    for (let i = 0; i < AUDIT_EXPORTS_PER_HOUR; i++) await exportAuditLog(w.actor(sara));
    await expect(exportAuditLog(w.actor(sara))).rejects.toEqual(expect.any(AuditExportLimit));
    // Another workspace counts its own.
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(exportAuditLog(other.actor(zoe))).resolves.toBeTruthy();
  });
});
