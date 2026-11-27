// Value Notes against the real database (spec 0064, #1308; GLOSSARY: Value Note): who reads and who writes them, what
// becomes of them when a value changes, and that they go where their values go.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { archiveMetric } from "./archived-metrics";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { buildMetricRecord } from "./metric-record";
import { retentionPreview, retentionValuesCsv } from "./retention-setting";
import { share } from "./sharing";
import { decideCorrection, submitValue } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditRowsOf, rowsOf, workspace } from "./test/db-fixtures";
import { createTotal } from "./total-changes";
import { correctValueNote, deleteValueNoteForGood, periodValueNotes, removeValueNote, writeValueNote } from "./value-notes";
import { NOTE_MAX, NOTE_TOO_LONG, NOTES_FULL } from "./value-note-store";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const P = "2026-03-01";

/** Sara (Owner) owns a Metric; Ann sends its values and sees it, Ben sees it, Cleo does not. */
async function setup(over: Record<string, unknown> = {}) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const ann = await w.person("member"); const ben = await w.person("member"); const cleo = await w.person("member");
  const m = await w.metric(sara, over);
  await w.share(m.id, ann); await w.share(m.id, ben);
  const code = await w.token(m.id, ann);
  const as = (p: string) => w.actor(p, p === sara ? "owner" : "member");
  /** A value Ann's program sends for a period, with a note when one is given. */
  const send = (value: number, valueNote?: string, period = P) => submitValue({ source: "api", sender: code, text: String(value), value: { value }, period, valueNote, workspaceId: w.id });
  const read = async (p = sara, period = P) => periodValueNotes(as(p), m.id, period);
  const words = async (p = sara) => (await read(p))!.current.map((n) => n.words);
  return { w, sara, ann, ben, cleo, m, code, as, send, read, words };
}

describe("writing, correcting and removing", () => {
  it("shows the newest words, keeps the earlier ones, and hides all words of a removed note, saying who removed it", async () => {
    const s = await setup();
    await s.send(45);
    const { id } = await writeValueNote(s.as(s.ann), { metricId: s.m.id, period: P, words: "  Two fairs.‮\u0007\r\nOne cancelled.  " });
    expect(await s.words(s.ben)).toEqual(["Two fairs.\nOne cancelled."]);
    await correctValueNote(s.as(s.sara), id, "Three fairs.");
    const after = (await s.read(s.ann))!;
    expect(after.current).toEqual([expect.objectContaining({ id, words: "Three fairs.", mayCorrect: true, mayDeleteForGood: false })]);
    expect(after.history.map((e) => [e.kind, e.words, e.saidOf])).toEqual([["written", "Two fairs.\nOne cancelled.", 45], ["corrected", "Three fairs.", 45]]);
    await removeValueNote(s.as(s.ann), id);
    const removed = (await s.read(s.ben))!;
    expect(removed.current).toEqual([]);
    expect(removed.history.map((e) => [e.kind, e.words])).toEqual([["written", null], ["corrected", null], ["removed", null]]);
    expect(removed.history[2]!.author).toContain("member");
    await expect(correctValueNote(s.as(s.sara), id, "Back again")).rejects.toThrow(/history/);
    const events = await auditRowsOf(s.w.id, "value_note.removed");
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("fairs");
  });

  it("deletes words for good for the Metric Owner only, also on an Archived Metric, which takes no other change", async () => {
    const s = await setup();
    await s.send(45, "A name that should not be here.");
    const id = (await s.read())!.current[0]!.id;
    await correctValueNote(s.as(s.ann), id, "Still there.");
    await expect(deleteValueNoteForGood(s.as(s.ann), id)).rejects.toBeInstanceOf(Forbidden);
    await archiveMetric(s.as(s.sara), s.m.id);
    await expect(writeValueNote(s.as(s.sara), { metricId: s.m.id, period: P, words: "Late" })).rejects.toThrow(/rchived/);
    await expect(removeValueNote(s.as(s.sara), id)).rejects.toThrow(/rchived/);
    await deleteValueNoteForGood(s.as(s.sara), id);
    const rows = await rowsOf("value_notes", { metric_id: s.m.id });
    expect(rows.map((r) => [r.words, r.erased_at !== null])).toEqual([[null, true], [null, true]]);
    expect((await s.read())!.history.every((e) => e.words === null && e.deletedForGood)).toBe(true);
    expect(await auditRowsOf(s.w.id, "value_note.deleted")).toHaveLength(1);
  });

  it("keeps at most 50 entries a period, and still takes a removal", async () => {
    const s = await setup();
    await s.send(45);
    let id = 0;
    for (let i = 0; i < 50; i += 1) ({ id } = await writeValueNote(s.as(s.sara), { metricId: s.m.id, period: P, words: `Note ${i}` }));
    await expect(writeValueNote(s.as(s.sara), { metricId: s.m.id, period: P, words: "One too many" })).rejects.toThrow(NOTES_FULL);
    expect((await s.send(45, "Over the limit")).valueNote).toEqual({ saved: false, reason: NOTES_FULL });
    await removeValueNote(s.as(s.sara), id);
    expect((await s.read())!.current).toHaveLength(49);
  });

  it("keeps the note of each of two senders who say the same of the same number", async () => {
    const s = await setup({ submission_rule: "keep_both" });
    const other = await s.w.token(s.m.id, s.ben);
    await s.send(4, "Trade fair.");
    const sent = await submitValue({ source: "api", sender: other, text: "4", value: { value: 4 }, period: P, valueNote: "Trade fair.", workspaceId: s.w.id });
    expect(sent.valueNote).toEqual({ saved: true, cut: false });
    expect(await s.words()).toEqual(["Trade fair.", "Trade fair."]);
    const rows = await rowsOf("value_notes", { metric_id: s.m.id });
    expect(new Set(rows.map((r) => r.observation_id)).size).toBe(2);
    expect(rows.map((r) => r.author_id).sort()).toEqual([s.ann, s.ben].sort());
  });

  it("gives none of the 50 places to a note that waits with a proposal", async () => {
    const s = await setup();
    await s.send(45);
    await s.w.lock(s.m.id, P);
    expect((await s.send(46, "Waits with the proposal.")).valueNote).toEqual({ saved: true, cut: false });
    for (let i = 0; i < 50; i += 1) await writeValueNote(s.as(s.sara), { metricId: s.m.id, period: P, words: `Note ${i}` });
    expect((await s.read())!.current).toHaveLength(50);
  });
});

describe("who reads and who writes", () => {
  it("gives notes only to who sees the value, and lets others write only on their own values", async () => {
    const s = await setup();
    await s.send(45, "From Ann.");
    const id = (await s.read())!.current[0]!.id;
    expect(await s.read(s.cleo)).toBeNull();
    expect(await periodValueNotes({ personId: s.sara, workspaceId: s.w.id, role: "owner", key: {} } as unknown as Actor, s.m.id, P)).toBeNull();
    const other = await setup();
    expect(await periodValueNotes(other.as(other.sara), s.m.id, P)).toBeNull();
    await expect(correctValueNote(other.as(other.sara), id, "Mine now")).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteValueNoteForGood(other.as(other.sara), id)).rejects.toBeInstanceOf(Forbidden);
    // A period without a value has no notes to show and takes none.
    expect(await s.read(s.sara, "2026-02-01")).toBeNull();
    await expect(writeValueNote(s.as(s.sara), { metricId: s.m.id, period: "2026-02-01", words: "No value" })).rejects.toBeInstanceOf(Forbidden);
    // Ben only views: he reads, writes nothing and changes nothing.
    expect(await s.words(s.ben)).toEqual(["From Ann."]);
    await expect(writeValueNote(s.as(s.ben), { metricId: s.m.id, period: P, words: "Mine" })).rejects.toBeInstanceOf(Forbidden);
    await expect(correctValueNote(s.as(s.ben), id, "Mine")).rejects.toBeInstanceOf(Forbidden);
    await expect(removeValueNote(s.as(s.ben), id)).rejects.toBeInstanceOf(Forbidden);
  });

  it("gives an author who no longer sees the Metric neither the note nor a way to change it", async () => {
    const s = await setup();
    await s.send(45, "From Ann.");
    const id = (await s.read())!.current[0]!.id;
    // Ann's value and note stay; her Share and her place as Submitter go.
    await s.w.unshare(s.m.id, s.ann);
    await db().from("tokens").delete().eq("metric_id", s.m.id).throwOnError();
    expect(await s.read(s.ann)).toBeNull();
    await expect(writeValueNote(s.as(s.ann), { metricId: s.m.id, period: P, words: "Still me" })).rejects.toBeInstanceOf(Forbidden);
    await expect(correctValueNote(s.as(s.ann), id, "Still me")).rejects.toBeInstanceOf(Forbidden);
    await expect(removeValueNote(s.as(s.ann), id)).rejects.toBeInstanceOf(Forbidden);
    expect(await s.words()).toEqual(["From Ann."]);
  });

  it("lets a Submitter write only on their own value where several send one", async () => {
    const s = await setup({ submission_rule: "keep_both" });
    const other = await s.w.token(s.m.id, s.ben);
    await s.send(4, "North.");
    await submitValue({ source: "api", sender: other, text: "6", value: { value: 6 }, period: P, workspaceId: s.w.id });
    const annsNote = (await s.read())!.current[0]!.id;
    const [annsValue] = await rowsOf("observations", { metric_id: s.m.id, submitter_id: s.ann });
    await expect(writeValueNote(s.as(s.ben), { metricId: s.m.id, period: P, words: "On Ann's", observationId: Number(annsValue!.id) })).rejects.toBeInstanceOf(Forbidden);
    await expect(correctValueNote(s.as(s.ben), annsNote, "Mine")).rejects.toBeInstanceOf(Forbidden);
    await expect(removeValueNote(s.as(s.ben), annsNote)).rejects.toBeInstanceOf(Forbidden);
    await writeValueNote(s.as(s.ben), { metricId: s.m.id, period: P, words: "South." });
    const rows = await rowsOf("value_notes", { metric_id: s.m.id, author_id: s.ben });
    expect(rows.map((r) => Number(r.observation_id))).not.toContain(Number(annsValue!.id));
    expect(await s.words()).toEqual(["South.", "North."]);
  });

  it("tells a Guest no names, neither as authors nor in the words", async () => {
    const s = await setup();
    const guest = await s.w.person("guest");
    await s.w.share(s.m.id, guest);
    const name = String((await rowsOf("profiles", { id: s.ann }))[0]!.name);
    await s.send(45, `${name} was away.`);
    const seen = (await periodValueNotes(s.w.actor(guest, "guest"), s.m.id, P))!;
    expect(seen.current[0]).toMatchObject({ author: "Someone", mayCorrect: false, mayDeleteForGood: false });
    expect(JSON.stringify(seen)).not.toContain(name);
  });

  it("keeps a Derived Metric's notes its own, written by who looks after it, with the number they were said of", async () => {
    const s = await setup();
    await s.send(45, "On the input only.");
    const derived = await s.w.metric(s.sara, { name: "Doubled", formula: `{${s.m.slug}} * 2`, sources: [] });
    await s.w.share(derived.id, s.ben);
    expect((await periodValueNotes(s.as(s.ben), derived.id, P))!.current).toEqual([]);
    await expect(writeValueNote(s.as(s.ben), { metricId: derived.id, period: P, words: "Mine" })).rejects.toBeInstanceOf(Forbidden);
    await writeValueNote(s.as(s.sara), { metricId: derived.id, period: P, words: "Doubled for a reason." });
    expect((await periodValueNotes(s.as(s.ben), derived.id, P))!.current[0]).toMatchObject({ words: "Doubled for a reason.", writtenWhenItShowed: null });
    await s.send(50);
    expect((await periodValueNotes(s.as(s.ben), derived.id, P))!.current[0]).toMatchObject({ writtenWhenItShowed: 90 });
  });

  it("shows no note of a Total to someone who is not shown what is added up", async () => {
    const s = await setup({ aggregation: "last" });
    await s.send(45);
    const eva = await s.w.metric(s.sara, { name: "Commit Eva", aggregation: "last" });
    await s.w.value(eva.id, P, 5);
    const total = await createTotal(s.as(s.sara), { name: "Commit", parts: [s.m.id, eva.id] }, { recordCreated: async () => undefined, promptSubmitter: async () => false as const });
    await writeValueNote(s.as(s.sara), { metricId: total.id, period: P, words: "Both regions." });
    await share(s.as(s.sara), "metric", total.id, s.ben, "viewer");
    // Ben sees one part but not the other.
    expect(await periodValueNotes(s.as(s.ben), total.id, P)).toBeNull();
    await s.w.share(eva.id, s.ben);
    expect((await periodValueNotes(s.as(s.ben), total.id, P))!.current.map((n) => n.words)).toEqual(["Both regions."]);
  });

  it("changes nothing in the demo", async () => {
    const demo: Actor = { personId: "t-nobody", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
    await expect(writeValueNote(demo, { metricId: 1, period: P, words: "x" })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(removeValueNote(demo, 1)).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(deleteValueNoteForGood(demo, 1)).rejects.toBeInstanceOf(DemoReadOnly);
  });
});

describe("a note that comes with a value", () => {
  it("is saved after the value; the same again adds nothing; a new value retires it", async () => {
    const s = await setup();
    expect((await s.send(45, "One fair.")).valueNote).toEqual({ saved: true, cut: false });
    expect((await s.send(45, "One fair.")).valueNote).toEqual({ saved: true, cut: false });
    await s.send(45);
    expect((await s.read())!.history).toHaveLength(1);
    await s.send(52);
    const after = (await s.read())!;
    expect(after.current).toEqual([]);
    expect(after.history).toEqual([expect.objectContaining({ words: "One fair.", saidOf: 45, replaced: true })]);
    await s.send(52, "Two fairs.");
    // The same number with other words replaces the value's note.
    await s.send(52, "Three fairs.");
    expect(await s.words()).toEqual(["Three fairs."]);
  });

  it("stays with each contribution where values are added", async () => {
    const s = await setup({ submission_rule: "add" });
    await s.send(4, "North.");
    await s.send(6, "South.");
    expect(await s.words()).toEqual(["South.", "North."]);
  });

  it("is not saved when a program sends one too long, while the value is; a form's is cut", async () => {
    const s = await setup();
    const sent = await s.send(45, "x".repeat(NOTE_MAX + 1));
    expect(sent).toMatchObject({ ok: true, valueNote: { saved: false, reason: NOTE_TOO_LONG } });
    expect(await s.read()).toMatchObject({ current: [], history: [] });
    const form = await submitValue({ source: "web_form", sender: s.code, text: "46", valueNote: "y".repeat(NOTE_MAX + 1) });
    expect(form.valueNote).toEqual({ saved: true, cut: true });
  });

  it("waits with a proposal for a locked period, and counts only once the Correction is accepted", async () => {
    const s = await setup();
    for (const [period, accept] of [[P, true], ["2026-02-01", false]] as const) {
      await s.w.value(s.m.id, period, 40, s.ann);
      await s.w.lock(s.m.id, period);
      expect((await s.send(45, "Found an invoice.", period)).valueNote).toEqual({ saved: true, cut: false });
      expect(await s.read(s.sara, period)).toMatchObject({ current: [], history: [] });
      const [row] = await rowsOf("value_notes", { metric_id: s.m.id, period_start: period });
      await decideCorrection(s.as(s.sara), Number(row!.proposal), accept);
      const after = (await s.read(s.sara, period))!;
      expect(after.current.map((n) => [n.words, n.addedLater])).toEqual(accept ? [["Found an invoice.", true]] : []);
      if (!accept) expect(await rowsOf("value_notes", { metric_id: s.m.id, period_start: period })).toEqual([]);
    }
  });
});

describe("where values go", () => {
  it("are in the Retention preview and download and go with the periods removed; the Metric's record holds them", async () => {
    const s = await setup();
    await s.w.value(s.m.id, "2019-01-01", 3, s.ann);
    await writeValueNote(s.as(s.sara), { metricId: s.m.id, period: "2019-01-01", words: "The old days." });
    const setting = { keep_months: 24, then: "delete" };
    expect(await retentionPreview(s.as(s.sara), s.m.id, setting)).toMatchObject({ periods: 1, valueNotes: 1 });
    expect(await retentionValuesCsv(s.as(s.sara), s.m.id, setting)).toContain("The old days.");
    const record = await buildMetricRecord(s.as(s.sara), [s.m.id]);
    expect(record.metrics[0]!.files.find((f) => f.name === "value-notes.csv")!.text).toContain("The old days.");
    const removed = await db().rpc("retention_remove_values", { p_ws: s.w.id, p_metric: s.m.id, p_from: "2019-01-01", p_to: "2019-01-01", p_periods: ["2019-01-01"], p_expected: 1, p_states: true });
    expect(removed.error).toBeNull();
    expect(await rowsOf("value_notes", { metric_id: s.m.id })).toEqual([]);
  });

  it("follow a Contact merged into a person, and go with their Metric", async () => {
    const s = await setup();
    const contact = await s.w.contact({ email: `${s.m.slug}@practice.invalid` });
    await s.w.value(s.m.id, P, 3, contact);
    await submitValue({ source: "api", sender: await s.w.token(s.m.id, contact), text: "4", value: { value: 4 }, period: "2026-02-01", valueNote: "From a Contact.", workspaceId: s.w.id });
    expect((await db().rpc("merge_contact", { ws: s.w.id, contact, person: s.cleo })).error).toBeNull();
    expect((await rowsOf("value_notes", { metric_id: s.m.id })).map((r) => r.author_id)).toEqual([s.cleo]);
    expect((await db().from("observations").delete().eq("metric_id", s.m.id)).error).toBeNull();
    expect((await db().from("metrics").delete().eq("id", s.m.id)).error).toBeNull();
    expect(await rowsOf("value_notes", { metric_id: s.m.id })).toEqual([]);
  });
});
