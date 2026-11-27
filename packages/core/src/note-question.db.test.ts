// The question "anything behind it?" against the real database (spec 0064, ticket #1312; GLOSSARY: Value Note, Metric
// Description, Combined Prompt, Held Reply): asked inside the confirmation and in no message of its own, by the Metric's
// setting, with no reason given and the same way for whoever may not see the Metric; answered by a reply or under a
// form's result; and **Ask for a note** set on several Metrics. No email leaves: Deliveries stay in the Outbox and the
// answers are collected.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { submitObservation } from "./api-submissions";
import { submitCombinedForm } from "./combined-form";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { fillInValue } from "./fill-in";
import { submitFormLink } from "./form-submit";
import { combinedCodeHash, storeCombinedWords } from "./internal/combined-delivery";
import { createMetric, metricEffects, setAskNote, updateMetricDetails } from "./metrics";
import { NOTE_QUESTION_OVER, saveAskedNote } from "./note-question";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { askForMissingValues } from "./questions";
import { recordOwnValue } from "./record-own-value";
import { routeReply, type RepliedDelivery } from "./reply-routing";
import { decideCorrection, submitValue, type SubmissionEffects } from "./submissions";
import { opened, rowsOf, valuesOf, workspace } from "./test/db-fixtures";
import { periodValueNotes } from "./value-notes";
import { listVersions, restoreVersion } from "./version-history";

// A reply address that arrives: without one an email asks for nothing. Nothing is sent to it from here.
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:9", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_INBOUND_DOMAIN: "in.ziffr.example.test", ZIFFR_INBOUND_SECRET: "i".repeat(40) };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const NOW = periodStart(new Date(), "month", JANUARY);
const BEFORE = shiftPeriod(NOW, "month", -1);
const quiet: SubmissionEffects = { notifyCorrection: async () => {}, afterValue: async () => [] };
const QUESTION = "Anything behind it?";

type Said = { text: string; invites: boolean; ask: boolean };

/** One person asked for one Metric by email, and what answers their replies. Nothing is sent. */
async function setup(metric: Record<string, unknown> = {}, shared = true) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const mark = randomUUID().slice(0, 8);
  const sara = await w.person("owner", { email: `sara-${mark}@example.test` });
  const ann = await w.person("member", { email: `ann-${mark}@example.test` });
  const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "mail"], ...metric });
  if (shared) await w.share(m.id, ann);
  const code = await w.token(m.id, ann);
  const request = async (person: string, metricId: number) => {
    await deliverPrompt({ metricId, submitterId: person, senderId: sara });
    return (await rowsOf("deliveries", { workspace_id: w.id, recipient_id: person })).map((d) => Number(d.id)).sort((a, b) => b - a)[0]!;
  };
  const deliveryId = await request(ann, m.id);
  const reply = replier(deliveryId, `ann-${mark}@example.test`);
  const notes = async (period = NOW) => (await periodValueNotes(w.actor(sara), m.id, period))?.current.map((n) => n.words) ?? [];
  return { w, sara, ann, m, code, deliveryId, reply, notes, request };
}

function replier(deliveryId: number, address: string) {
  return async (text: string) => {
    const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, combined").eq("id", deliveryId).single();
    const said: Said[] = [];
    const outcome = await routeReply(d as RepliedDelivery, text, { source: "mail", sender: address, answer: async (_subject, words, _link, how) => { said.push({ text: words, invites: Boolean(how?.invites), ask: Boolean(how?.ask) }); } }, quiet);
    return { outcome, said, words: said.map((s) => s.text).join("\n") };
  };
}

/** Ann is asked for Revenue and Costs in one message. */
async function several() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const mark = randomUUID().slice(0, 8);
  const sara = await w.person("owner", { email: `sara-${mark}@example.test` });
  const ann = await w.person("member", { email: `ann-${mark}@example.test` });
  const made = async (name: string) => {
    const m = await w.metric(sara, { name, sources: ["web_form", "mail"] });
    await w.share(m.id, ann); await w.token(m.id, ann);
    return m;
  };
  const revenue = await made("Revenue");
  const costs = await made("Costs");
  await askForMissingValues(w.actor(sara));
  const [d] = await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ann });
  // Numbered as when the message leaves; nothing is sent from here.
  await storeCombinedWords(w.id, Number(d!.id), true);
  const at = async (metricId: number) => Number((await rowsOf("delivery_prompts", { delivery_id: d!.id, metric_id: metricId }))[0]!.position);
  return { w, sara, ann, revenue, costs, deliveryId: Number(d!.id), positions: { revenue: await at(revenue.id), costs: await at(costs.id) }, reply: replier(Number(d!.id), `ann-${mark}@example.test`) };
}

/** A combined form's link as it would leave with the message. */
async function formLink(ws: string, deliveryId: number) {
  const code = randomBytes(32).toString("base64url");
  const { error } = await db().from("combined_form_links").insert({ code_hash: combinedCodeHash(code), workspace_id: ws, delivery_id: deliveryId, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  expect(error).toBeNull();
  return code;
}

const deliveriesOf = async (ws: string) => (await rowsOf("deliveries", { workspace_id: ws })).length;

describe("the question in a reply's confirmation", () => {
  it("is part of the one answer, sends nothing of its own, takes the reply as the note and asks once", async () => {
    const s = await setup();
    const before = await deliveriesOf(s.w.id);
    const first = await s.reply("45");
    expect(first.said).toEqual([{ text: expect.stringContaining(`${QUESTION} Reply with a few words, or leave it. Everyone who sees this Metric can read them.`), invites: true, ask: true }]);
    expect(await deliveriesOf(s.w.id)).toBe(before);
    expect(await s.reply("Two orders slipped.")).toMatchObject({ outcome: "noted", said: [] });
    expect(await s.notes()).toEqual(["Two orders slipped."]);
    const again = await s.reply("47");
    expect(again.said).toEqual([expect.objectContaining({ ask: false, invites: false })]);
    expect(again.words).not.toContain("Anything behind");
  });

  it("is closed by no or thanks, which save nothing", async () => {
    const s = await setup();
    await s.reply("45");
    expect(await s.reply("no")).toMatchObject({ outcome: "closed", said: [] });
    expect(await s.notes()).toEqual([]);
    expect((await rowsOf("note_questions", { delivery_id: s.deliveryId }))[0]!.closed_at).not.toBeNull();
  });

  it("is not put when a note came along, the setting is never, or the value was refused", async () => {
    const s = await setup();
    expect((await s.reply("45\r\nCounted twice.")).words).not.toContain(QUESTION);
    const never = await setup({ ask_note: "never" });
    expect((await never.reply("45")).words).not.toContain(QUESTION);
    expect(await rowsOf("note_questions", { workspace_id: never.w.id })).toEqual([]);
    const reject = await setup({ submission_rule: "reject" });
    await reject.w.value(reject.m.id, NOW, 1, reject.ann);
    await db().from("metrics").update({ submission_rule: "reject" }).eq("id", reject.m.id);
    expect((await reject.reply("46 and 47")).words).not.toContain(QUESTION);
  });

  it("gives no reason: off target or unusual asks in the same words as always", async () => {
    const off = await setup({ ask_note: "off_target_or_unusual", target_min: 100 });
    const asked = (await off.reply("45")).words;
    expect(asked).toContain(`${QUESTION} Reply with a few words`);
    expect(asked.slice(asked.indexOf(QUESTION))).not.toMatch(/target|unusual|below|above/i);
    const on = await setup({ ask_note: "off_target_or_unusual", target_min: 100 });
    expect((await on.reply("150")).words).not.toContain(QUESTION);
    const jump = await setup({ ask_note: "off_target_or_unusual" });
    await jump.w.value(jump.m.id, BEFORE, 100, jump.ann);
    expect((await jump.reply("500")).words).toContain(QUESTION);
    const steady = await setup({ ask_note: "off_target_or_unusual" });
    await steady.w.value(steady.m.id, BEFORE, 100, steady.ann);
    expect((await steady.reply("110")).words).not.toContain(QUESTION);
  });

  it("asks whoever may not see the Metric every time, so that asking tells them nothing", async () => {
    // A Submitter sees the Metric they send, so on target nothing is asked of them; a Contact sees none.
    const hidden = await setup({ ask_note: "off_target_or_unusual", target_min: 100 }, false);
    expect((await hidden.reply("150")).words).not.toContain(QUESTION);
    const address = `c-${randomUUID().slice(0, 8)}@example.test`;
    const contact = await hidden.w.contact({ email: address });
    const m = await hidden.w.metric(hidden.sara, { name: "Visits", sources: ["mail"], ask_note: "off_target_or_unusual", target_min: 100 });
    await hidden.w.token(m.id, contact);
    const d = await hidden.request(contact, m.id);
    expect((await replier(d, address)("150")).words).toContain(QUESTION);
  });

  it("asks one question for several numbers and takes each answer by its number", async () => {
    const s = await several();
    const { revenue: r, costs: c } = s.positions;
    const answer = await s.reply(`${r}: 45\r\n${c}: 12`);
    expect(answer.words).toContain(`Anything behind them? Reply "1: your words" (1, 2), or leave it.`);
    expect(answer.said).toHaveLength(1);
    expect((await s.reply(`${c}: Rent went up.`)).outcome).toBe("noted");
    expect((await rowsOf("note_questions", { delivery_id: s.deliveryId })).filter((q) => q.closed_at)).toHaveLength(1);
  });

  it("takes the answer to a proposed Correction with the proposal, and a second one in its place", async () => {
    const s = await setup();
    await s.w.lock(s.m.id, NOW);
    const r = await s.reply("45");
    expect(r.words).toContain("proposed correction");
    expect(r.words).toContain(QUESTION);
    expect((await s.reply("Late invoice.")).words).toBe("");
    expect(await s.reply("A very late invoice.")).toMatchObject({ outcome: "noted" });
    expect(await s.notes()).toEqual([]);
    const [message] = await rowsOf("thread_messages", { workspace_id: s.w.id, correction_status: "proposed" });
    expect(await rowsOf("value_notes", { proposal: message!.id })).toHaveLength(1);
    await decideCorrection(s.w.actor(s.sara), Number(message!.id), true, { notifyDecision: async () => {}, afterValue: async () => [] });
    expect(await s.notes()).toEqual(["A very late invoice."]);
  });

  it("is never asked of a program", async () => {
    const s = await setup({ sources: ["web_form", "mail", "api"] });
    const r = await submitObservation(s.w.actor(s.ann, "member"), s.m.slug, { value: 45 }, quiet);
    expect(JSON.stringify(r)).not.toContain(QUESTION);
    const direct = await submitValue({ source: "api", sender: s.code, text: "46", value: { value: 46 }, workspaceId: s.w.id }, quiet);
    expect(direct.numberOnly).toBeUndefined();
    expect(await rowsOf("note_questions", { workspace_id: s.w.id })).toEqual([]);
  });
});

describe("the question under a form's result", () => {
  it("saves one note on the value just sent, hands the browser a code and nothing else, and works once", async () => {
    const s = await setup();
    const r = await submitFormLink(s.code, { value: "45" }, quiet);
    expect(r.ask).toHaveLength(43);
    expect(r).not.toHaveProperty("numberOnly");
    const [row] = await rowsOf("note_questions", { workspace_id: s.w.id });
    expect(JSON.stringify(row)).not.toContain(r.ask);
    expect(await saveAskedNote("x".repeat(43), "Guess")).toEqual({ saved: false, detail: NOTE_QUESTION_OVER });
    expect(await saveAskedNote(r.ask, "   ")).toMatchObject({ saved: false });
    expect(await saveAskedNote(r.ask, "A late delivery.")).toEqual({ saved: true, detail: "Your note was saved." });
    expect(await s.notes()).toEqual(["A late delivery."]);
    expect(await saveAskedNote(r.ask, "Again")).toEqual({ saved: false, detail: NOTE_QUESTION_OVER });
    const [entry] = await opened("value_notes", s.w.id, await rowsOf("value_notes", { workspace_id: s.w.id }));
    expect(entry).toMatchObject({ author_id: s.ann, source: "web_form" });
  });

  it("is over once the link's Token is gone, the day has passed or the account is blocked", async () => {
    const s = await setup();
    const r = await submitFormLink(s.code, { value: "45" }, quiet);
    await db().from("note_questions").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("workspace_id", s.w.id);
    expect(await saveAskedNote(r.ask, "Too late")).toMatchObject({ saved: false });
    const second = await submitFormLink(s.code, { value: "46" }, quiet);
    await db().from("tokens").delete().eq("code", s.code);
    expect(await saveAskedNote(second.ask, "No longer mine")).toEqual({ saved: false, detail: NOTE_QUESTION_OVER });
    expect(await s.notes()).toEqual([]);
  });

  it("files the note under the earlier value when it was replaced meanwhile", async () => {
    const s = await setup();
    const first = await submitFormLink(s.code, { value: "45" }, quiet);
    await recordOwnValue(s.w.actor(s.ann, "member"), s.m.id, { value: "60", note: "Recounted." }, quiet);
    expect((await saveAskedNote(first.ask, "Said of the first one.")).detail).toContain("filed under your earlier value");
    expect(await s.notes()).toEqual(["Recounted."]);
    const history = (await periodValueNotes(s.w.actor(s.sara), s.m.id, NOW))!.history;
    expect(history).toContainEqual(expect.objectContaining({ words: "Said of the first one.", saidOf: 45, replaced: true }));
  });

  it("is for the signed-in person alone after Record a value and Fill in for, judged by what they see", async () => {
    const s = await setup({ ask_note: "off_target_or_unusual", target_min: 100 });
    expect((await recordOwnValue(s.w.actor(s.ann, "member"), s.m.id, { value: "150" }, quiet)).ask).toBeUndefined();
    const r = await recordOwnValue(s.w.actor(s.ann, "member"), s.m.id, { value: "45" }, quiet);
    expect(r.ask).toHaveLength(43);
    expect(await saveAskedNote(r.ask, "Nobody")).toMatchObject({ saved: false });
    expect(await saveAskedNote(r.ask, "Someone else", s.w.actor(s.sara))).toMatchObject({ saved: false });
    expect(await saveAskedNote(r.ask, "Mine", s.w.actor(s.ann, "member"))).toMatchObject({ saved: true });
    expect(await s.notes()).toEqual(["Mine"]);
    // Fill in for: the note is the one of whoever entered the value.
    await db().from("metrics").update({ ask_note: "always" }).eq("id", s.m.id);
    await db().from("observations").delete().eq("metric_id", s.m.id);
    const today = new Date().toISOString().slice(0, 10);
    await db().from("away").insert({ user_id: s.ann, starts: today, ends: today, set_by: s.ann });
    const filled = await fillInValue(s.w.actor(s.sara), { metricId: s.m.id, period: NOW, for: s.ann, value: "50" }, quiet);
    expect(filled.ask).toHaveLength(43);
    expect(await saveAskedNote(filled.ask, "Filled in for Ann.", s.w.actor(s.sara))).toMatchObject({ saved: true });
  });

  it("opens under each row of the combined form that came without a note", async () => {
    const s = await several();
    const code = await formLink(s.w.id, s.deliveryId);
    const { revenue: r, costs: c } = s.positions;
    const sent = await submitCombinedForm(code, [{ position: r, value: "45" }, { position: c, value: "12", note: "Rent." }], quiet);
    expect(sent.rows[r]!.ask).toHaveLength(43);
    expect(sent.rows[c]!.ask).toBeUndefined();
    expect(await saveAskedNote(sent.rows[r]!.ask, "From the one page.")).toMatchObject({ saved: true });
    expect((await periodValueNotes(s.w.actor(s.sara), s.revenue.id, NOW))!.current.map((n) => n.words)).toEqual(["From the one page."]);
  });
});

describe("Ask for a note", () => {
  it("is set when a Metric is made and changed, kept as a Version and restored", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const effects = { recordCreated: metricEffects.recordCreated, promptSubmitter: async () => {} };
    const made = await createMetric(w.actor(sara), { name: "Orders" }, effects);
    const of = async () => (await rowsOf("metrics", { id: made.id }))[0]!.ask_note;
    expect(await of()).toBe("always");
    await updateMetricDetails(w.actor(sara), made.id, { askNote: "never" });
    expect(await of()).toBe("never");
    await updateMetricDetails(w.actor(sara), made.id, { name: "Orders taken" });
    expect(await of()).toBe("never");
    await expect(updateMetricDetails(w.actor(sara), made.id, { askNote: "sometimes" })).rejects.toThrow("Ask for a note");
    const derived = await w.metric(sara, { name: "Half", formula: "{orders} / 2" });
    await expect(updateMetricDetails(w.actor(sara), derived.id, { askNote: "never" })).rejects.toThrow("never asks");
    // The first Version, made before the setting was changed.
    const { versions } = await listVersions(w.actor(sara), "metric", made.id);
    await restoreVersion(w.actor(sara), Number(versions.at(-1)!.id));
    expect(await of()).toBe("always");
  });

  it("is set on several at once: those the person may not change are left out and counted", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const ben = await w.person("member");
    const gus = await w.person("guest");
    const mine = await w.metric(ben, { name: "Mine" });
    const theirs = await w.metric(sara, { name: "Theirs" });
    const seen = await w.metric(sara, { name: "Seen" });
    await w.share(seen.id, ben);
    const derived = await w.metric(ben, { name: "Half", formula: `{${mine.slug}} / 2` });
    const other = await workspace(); cleanups.push(other.cleanup);
    const foreign = await other.metric(await other.person("owner"), { name: "Elsewhere" });
    const ids = [mine.id, theirs.id, seen.id, derived.id, foreign.id];
    expect(await setAskNote(w.actor(ben, "member"), ids, "never")).toEqual({ changed: 1, leftOut: 4 });
    const of = async (id: number) => (await rowsOf("metrics", { id }))[0]!.ask_note;
    expect(await Promise.all(ids.map(of))).toEqual(["never", "always", "always", "always", "always"]);
    expect(await setAskNote(w.actor(gus, "guest"), [theirs.id], "never")).toEqual({ changed: 0, leftOut: 1 });
    await expect(setAskNote(w.actor(ben, "member"), [mine.id], "loudly")).rejects.toThrow("Ask for a note");
    expect(await valuesOf(mine.id)).toEqual([]);
  });
});
