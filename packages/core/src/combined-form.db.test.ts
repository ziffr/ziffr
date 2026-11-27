// The combined form and the note on the forms, against the real database (spec 0064, ticket #1310; GLOSSARY: Combined
// Prompt, Token, Stand-in, Value Note): a link opens exactly the figures of its message and nothing beyond them, every
// submission is checked live against its own Token, a link ends and is limited, and the note field adds nothing while
// the switch is off. The switch is turned on here only.
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startAsking } from "./asking-run";
import { combinedForm, COMBINED_FORM_TRIES_PER_HOUR, COMBINED_LINK_OVER, COMBINED_TOO_OFTEN, submitCombinedForm, type CombinedOpenRow } from "./combined-form";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { optOutByToken } from "./email-opt-out";
import { fillInValue } from "./fill-in";
import { submitFormLink } from "./form-submit";
import { withFormLink } from "./internal/delivery-send";
import { sendDelivery, type OutgoingMail } from "./mail";
import { submissionForm } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { askForMissingValues } from "./questions";
import { recordingOffer, recordOwnValue } from "./record-own-value";
import { opened, rowsOf, workspace } from "./test/db-fixtures";
import { periodValueNotes } from "./value-notes";
import { saveWorkflow } from "./workflows";

const state = vi.hoisted(() => ({ on: true }));
vi.mock("./combined-switch", () => ({ combinedPromptsOn: () => state.on }));

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { state.on = true; vi.unstubAllEnvs(); for (const c of cleanups.splice(0)) await c(); });

const SITE = "https://ziffr.example.test";
const NOW = periodStart(new Date(), "month", JANUARY);

/** Ann is asked for three Metrics of Sara's in one message; a fourth is none of Ann's. */
async function asked() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  // A test domain: nothing is ever sent from here, the one mail below goes to a test's own transport.
  const ann = await w.person("member", { email: `ann-${w.id.slice(0, 8)}@example.test` });
  const ben = await w.person("member");
  const made = async (name: string, submitter: string) => {
    const m = await w.metric(sara, { name, description: `${name} as counted`, period: "month" });
    return { ...m, code: await w.token(m.id, submitter) };
  };
  const revenue = await made("Revenue", ann);
  const costs = await made("Costs", ann);
  const visits = await made("Visits", ann);
  const secret = await made("Payroll secret", ben);
  await askForMissingValues(w.actor(sara));
  const [d] = (await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ann })) as { id: number }[];
  return { w, sara, ann, ben, revenue, costs, visits, secret, deliveryId: d!.id, ...(await link(w.id, d!.id)) };
}

/** The link as it would leave with the message. */
async function link(ws: string, deliveryId: number) {
  const [d] = await opened("deliveries", ws, await rowsOf("deliveries", { id: deliveryId }));
  const text = await withFormLink(String(d!.body), { id: deliveryId, workspace_id: ws, form_token_id: null, combined: true }, SITE);
  const code = /\/submit\/all\/([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? "";
  return { text, code, stored: String(d!.body) };
}

type Setup = Awaited<ReturnType<typeof asked>>;
const positionOf = async (s: Setup, metricId: number) => Number((await rowsOf("delivery_prompts", { delivery_id: s.deliveryId, metric_id: metricId }))[0]!.position);
const rowFor = async (s: Setup, metricId: number) => { const position = await positionOf(s, metricId); return (await combinedForm(s.code))!.rows.find((r) => r.position === position); };
const values = async (metricId: number) => (await rowsOf("observations", { metric_id: metricId })).length;

describe("the combined form's link", () => {
  it("is made as the message leaves, kept only as a hash, and never stored with the message", async () => {
    const s = await asked();
    expect(s.code).toHaveLength(43);
    expect(s.stored).not.toContain("/submit/");
    const rows = await rowsOf("combined_form_links", { delivery_id: s.deliveryId });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(s.code);
    const days = (Date.parse(String(rows[0]!.expires_at)) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("opens exactly its figures: no other Metric, no Token code, no link, no id and no note", async () => {
    const s = await asked();
    await submitFormLink(s.revenue.code, { value: "7", note: "Said before" });
    const form = (await combinedForm(s.code))!;
    expect(form.rows.map((r) => r.name).sort()).toEqual(["Costs", "Revenue", "Visits"]);
    const revenue = (await rowFor(s, s.revenue.id)) as CombinedOpenRow;
    expect(Object.keys(revenue).sort()).toEqual(["answeredOn", "description", "has", "name", "open", "periodLabel", "placeholder", "position", "rule", "standingInFor"]);
    // The period asked for has ended; a form link says no value for it, and it has been answered, so it takes none.
    const sent = JSON.stringify(form);
    for (const hidden of ["Payroll secret", "Said before", "tk-", s.revenue.slug, "/metrics", "/submit", s.ann]) expect(sent).not.toContain(hidden);
  });

  it("opens nothing for a code that is unknown, malformed or ended, or whose person left or is blocked", async () => {
    const s = await asked();
    for (const bad of ["", "x", randomBytes(32).toString("base64url"), `${s.code}x`, s.revenue.code, null, 7]) expect(await combinedForm(bad)).toBeNull();
    await db().from("combined_form_links").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("delivery_id", s.deliveryId);
    expect(await combinedForm(s.code)).toBeNull();
    expect(await submitCombinedForm(s.code, [{ position: 1, value: "4" }])).toEqual({ rows: {}, refused: COMBINED_LINK_OVER });
    const again = await link(s.w.id, s.deliveryId);
    expect(await combinedForm(again.code)).not.toBeNull();
    await s.w.dropMember(s.ann);
    expect(await combinedForm(again.code)).toBeNull();
    expect(await submitCombinedForm(again.code, [{ position: 1, value: "4" }])).toMatchObject({ refused: COMBINED_LINK_OVER });
    expect(await values(s.revenue.id)).toBe(0);
  });

  it("opens nothing and takes nothing while the person is a Blocked User", async () => {
    const s = await asked();
    const { data, error } = await db().auth.admin.createUser({ email: `blocked-${s.w.id.slice(0, 8)}@example.test`, password: `pw-${s.w.id}`, email_confirm: true });
    if (error) throw error;
    cleanups.push(async () => { await db().auth.admin.deleteUser(data.user.id); });
    await db().from("profiles").update({ auth_user_id: data.user.id }).eq("id", s.ann);
    expect(await combinedForm(s.code)).not.toBeNull();
    await db().auth.admin.updateUserById(data.user.id, { ban_duration: "1h" });
    expect(await combinedForm(s.code)).toBeNull();
    expect(await submitCombinedForm(s.code, [{ position: 1, value: "4" }])).toEqual({ rows: {}, refused: COMBINED_LINK_OVER });
    expect(await values(s.revenue.id)).toBe(0);
  });

  it("gets no link once the message is more than 30 days old", async () => {
    const s = await asked();
    const text = await withFormLink(s.stored, { id: s.deliveryId, workspace_id: s.w.id, form_token_id: null, combined: true, sent_at: new Date(Date.now() - 31 * 86_400_000).toISOString() } as never, SITE);
    expect(text).not.toContain("/submit/");
    expect(text).not.toContain("one page");
  });
});

describe("sending the combined form", () => {
  it("records each filled number through its own Token with its note, skips empty rows and leaves the rest open", async () => {
    const s = await asked();
    const [r, c] = [await positionOf(s, s.revenue.id), await positionOf(s, s.costs.id)];
    const result = await submitCombinedForm(s.code, [{ position: r, value: "45", note: "Two fairs" }, { position: c, value: "", note: "" }]);
    expect(result.refused).toBeUndefined();
    expect(Object.keys(result.rows)).toEqual([String(r)]);
    expect(result.rows[r]).toMatchObject({ ok: true, detail: expect.stringContaining("Your note was saved.") });
    expect(result.rows[r]!.detail).not.toContain("personal form link");
    expect([await values(s.revenue.id), await values(s.costs.id), await values(s.visits.id)]).toEqual([1, 0, 0]);
    const [value] = await rowsOf("observations", { metric_id: s.revenue.id });
    expect(value).toMatchObject({ submitter_id: s.ann, source: "web_form" });
    const period = String(value!.period_start);
    expect((await periodValueNotes(s.w.actor(s.sara), s.revenue.id, period))!.current.map((n) => n.words)).toEqual(["Two fairs"]);
    const prompts = await rowsOf("prompts", { workspace_id: s.w.id, submitter_id: s.ann });
    expect(prompts.filter((p) => p.answered_at).map((p) => p.metric_id)).toEqual([s.revenue.id]);
    // The page can be opened again for the rest.
    expect((await rowFor(s, s.costs.id))!.open).toBe(true);
  });

  it("closes a period that has ended once it is answered, and takes nothing more for it", async () => {
    const s = await asked();
    const before = shiftPeriod(NOW, "month", -1);
    await db().from("prompts").update({ period_start: before }).eq("workspace_id", s.w.id).eq("metric_id", s.revenue.id);
    const r = await positionOf(s, s.revenue.id);
    expect((await rowFor(s, s.revenue.id)) as CombinedOpenRow).toMatchObject({ open: true, has: null });
    expect((await submitCombinedForm(s.code, [{ position: r, value: "45" }])).rows[r]).toMatchObject({ ok: true });
    expect(await rowFor(s, s.revenue.id)).toMatchObject({ open: false, name: "Revenue", words: expect.stringContaining("Answered") });
    expect(await rowFor(s, s.revenue.id)).not.toHaveProperty("has");
    expect((await submitCombinedForm(s.code, [{ position: r, value: "99", note: "late" }])).rows[r]).toMatchObject({ ok: false, noteKept: true });
    expect(await values(s.revenue.id)).toBe(1);
  });

  it("checks every figure live: an archived Metric, one that refuses the form and a removed Token take nothing", async () => {
    const s = await asked();
    const at = { r: await positionOf(s, s.revenue.id), c: await positionOf(s, s.costs.id), v: await positionOf(s, s.visits.id) };
    await s.w.patchMetric(s.revenue.id, { archived_at: new Date().toISOString() });
    await s.w.patchMetric(s.costs.id, { sources: ["mail"] });
    await db().from("tokens").delete().eq("code", s.visits.code);
    const form = (await combinedForm(s.code))!;
    // No longer asked is not named; one answered by reply alone is not on the form.
    expect(form.rows).toEqual([at.r, at.v].sort((a, b) => a - b).map((position) => ({ position, open: false, name: null, periodLabel: null, words: "No longer asked of you." })));
    const result = await submitCombinedForm(s.code, Object.values(at).map((position) => ({ position, value: "5" })));
    expect(Object.values(result.rows).every((row) => !row.ok)).toBe(true);
    expect([await values(s.revenue.id), await values(s.costs.id), await values(s.visits.id)]).toEqual([0, 0, 0]);
  });

  it("takes a Stand-in's number only while they stand in", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ann = await w.person("member"); const ben = await w.person("member");
    const made = [];
    for (const name of ["Revenue", "Costs"]) {
      const m = await w.metric(sara, { name, period: "month" });
      await w.token(m.id, ann, { stand_in_id: ben });
      made.push(m);
    }
    // One run's asking of Ben in Ann's place, as it happens while she is Away.
    const run = startAsking(w.id, new Date().toISOString().slice(0, 10))!;
    const step = run.step();
    for (const m of made) await deliverPrompt({ metricId: m.id, submitterId: ben, senderId: sara, standingInFor: ann, queue: true, into: step.into });
    await step.done(async () => {});
    await run.flush();
    const [d] = (await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ben, combined: true })) as { id: number }[];
    const { code } = await link(w.id, d!.id);
    expect((await combinedForm(code))!.rows.map((r) => r.open && r.standingInFor)).toEqual([expect.stringContaining("member"), expect.stringContaining("member")]);
    await db().from("tokens").update({ stand_in_id: null }).eq("workspace_id", w.id).eq("submitter_id", ann);
    expect((await combinedForm(code))!.rows.every((r) => !r.open && r.name === null)).toBe(true);
    const result = await submitCombinedForm(code, [{ position: 1, value: "3" }]);
    expect(result.rows[1]).toMatchObject({ ok: false });
    expect(await values(made[0]!.id) + await values(made[1]!.id)).toBe(0);
  });

  it("reads only what a form could send, and says so when there is nothing", async () => {
    const s = await asked();
    for (const junk of [null, "1", {}, [], [null, 3, { position: "1", value: "4" }, { position: 0, value: "4" }, { position: 51, value: "4" }, { position: 1.5, value: "4" }, { position: 1, value: 4 }]]) {
      expect(await submitCombinedForm(s.code, junk)).toEqual({ rows: {}, refused: "Type at least one number." });
    }
    expect((await submitCombinedForm(s.code, [{ position: 49, value: "4" }])).rows[49]).toMatchObject({ ok: false });
    const r = await positionOf(s, s.revenue.id);
    expect((await submitCombinedForm(s.code, [{ position: r, note: "Only words" }])).rows[r]).toMatchObject({ ok: false, noteKept: true });
    expect(await values(s.revenue.id)).toBe(0);
  });

  it("is limited for each message, whichever of its links is used; opening it uses no try", async () => {
    const s = await asked();
    for (let i = 0; i < 3; i++) await combinedForm(s.code);
    for (let i = 0; i < COMBINED_FORM_TRIES_PER_HOUR; i++) expect((await submitCombinedForm(s.code, [{ position: 49, value: "4" }])).refused).toBeUndefined();
    const another = await link(s.w.id, s.deliveryId);
    const r = await positionOf(s, s.revenue.id);
    for (const code of [s.code, another.code]) expect(await submitCombinedForm(code, [{ position: r, value: "4" }])).toEqual({ rows: {}, refused: COMBINED_TOO_OFTEN });
    expect(await values(s.revenue.id)).toBe(0);
    // An hour on, it takes tries again.
    await db().from("deliveries").update({ form_tries_since: new Date(Date.now() - 3_700_000).toISOString() }).eq("id", s.deliveryId);
    expect((await submitCombinedForm(s.code, [{ position: r, value: "4" }])).rows[r]).toMatchObject({ ok: true });
  });
});

describe("a Combined Prompt by email", () => {
  it("carries the link to its form and the link that stops these emails, which works", async () => {
    // The message is made while no email is set up, then sent through the test's own transport.
    const s = await asked();
    vi.stubEnv("ZIFFR_SMTP_URL", "smtp://127.0.0.1:1");
    vi.stubEnv("ZIFFR_MAIL_FROM", "Ziffr <ziffr@example.test>");
    vi.stubEnv("ZIFFR_SITE_URL", SITE);
    await db().from("deliveries").update({ mail_state: "queued", attempts: 0 }).eq("id", s.deliveryId);
    const mails: OutgoingMail[] = [];
    expect(await sendDelivery(s.deliveryId, async (mail) => { mails.push(mail); return { messageId: "<1@test>" }; })).toBe("sent");
    const [mail] = mails;
    expect(mail!.action).toEqual({ label: "Fill in your numbers", url: expect.stringMatching(/\/submit\/all\/[A-Za-z0-9_-]{43}$/) });
    expect(await combinedForm(mail!.action!.url.split("/").pop())).not.toBeNull();
    expect(mail!.unsubscribe).toMatch(/\/api\/unsubscribe\/[A-Za-z0-9_-]{32}$/);
    expect(await optOutByToken(mail!.unsubscribe!.split("/").pop()!)).toMatchObject({ undo: expect.any(String) });
    expect(await rowsOf("email_opt_outs", { workspace_id: s.w.id, person_id: s.ann })).toHaveLength(1);
  });
});

describe("the note on the other forms", () => {
  async function one() {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { period: "month" });
    await w.share(m.id, ann);
    const code = await w.token(m.id, ann);
    const notes = async () => (await periodValueNotes(w.actor(sara), m.id, NOW))?.current.map((n) => n.words) ?? [];
    return { w, sara, ann, m, code, notes };
  }

  it("goes with a value from the form link and from Record a value", async () => {
    const s = await one();
    expect((await submissionForm(s.code))!.notes).toBe(true);
    expect((await recordingOffer(s.w.actor(s.ann, "member"), s.m.id))!.notes).toBe(true);
    expect((await submitFormLink(s.code, { value: "3", note: "By the link" })).detail).toContain("Your note was saved.");
    expect(await s.notes()).toEqual(["By the link"]);
    await recordOwnValue(s.w.actor(s.ann, "member"), s.m.id, { value: "4", note: "x".repeat(1200) });
    expect((await s.notes())[0]).toHaveLength(1000);
  });

  it("of a value filled in for someone is the note of whoever entered it", async () => {
    const s = await one();
    const flow = await saveWorkflow(s.w.actor(s.sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] });
    await s.w.patchMetric(s.m.id, { workflow_id: flow });
    const r = await fillInValue(s.w.actor(s.sara), { metricId: s.m.id, period: shiftPeriod(NOW, "month", -2), for: s.ann, value: "9", note: "From the ledger" });
    expect(r).toMatchObject({ ok: true });
    const [note] = await rowsOf("value_notes", { metric_id: s.m.id });
    expect(note!.author_id).toBe(s.sara);
  });

  it("is neither offered nor taken while the switch is off", async () => {
    state.on = false;
    const s = await one();
    expect((await submissionForm(s.code))!.notes).toBe(false);
    expect(await recordingOffer(s.w.actor(s.ann, "member"), s.m.id)).not.toHaveProperty("notes");
    await submitFormLink(s.code, { value: "3", note: "Not taken" });
    await recordOwnValue(s.w.actor(s.ann, "member"), s.m.id, { value: "4", note: "Nor this" });
    expect(await rowsOf("value_notes", { metric_id: s.m.id })).toEqual([]);
  });
});
