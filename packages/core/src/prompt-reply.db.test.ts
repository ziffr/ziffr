// Replies to requests against the real database (spec 0064, ticket #1311; GLOSSARY: Prompt, Combined Prompt, Value
// Note, Submission Rule): each row of the later reply table, each rule of the offer, numbered answers for several
// figures, and what becomes of waiting messages when a figure stops being asked. No message leaves: with no email set
// up here, Deliveries stay in the Outbox, and the answers are collected.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { archiveMetric } from "./archived-metrics";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { holdCombined, METRIC_DELETED_SINCE } from "./internal/combined-delivery";
import { deleteMetric, removeSubmitters } from "./metrics";
import { JANUARY, periodStart } from "./periods";
import { repliesAllowed } from "./prompt-reply";
import { askForMissingValues } from "./questions";
import { routeReply, type RepliedDelivery } from "./reply-routing";
import { submitValue, type SubmissionEffects } from "./submissions";
import { opened, rowsOf, valuesOf, workspace } from "./test/db-fixtures";
import { periodValueNotes, removeValueNote, writeValueNote } from "./value-notes";
import type { SubmissionRule } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const NOW = periodStart(new Date(), "month", JANUARY);
const quiet: SubmissionEffects = { notifyCorrection: async () => {}, afterValue: async () => [] };
const COLUMNS = "id, workspace_id, recipient_id, kind, action_id, prompt_id, combined";

type Answer = { subject: string; text: string; invites: boolean };

/** Replies as the person by email (the text is cleaned as an email's is) and collects what Ziffr answers. */
function replier(deliveryId: number, address: string) {
  return async (text: string) => {
    const { data: d } = await db().from("deliveries").select(COLUMNS).eq("id", deliveryId).single();
    const answers: Answer[] = [];
    const outcome = await routeReply(d as RepliedDelivery, text, { source: "mail", sender: address, answer: async (subject, said, _link, how) => { answers.push({ subject, text: said, invites: Boolean(how?.invites) }); } }, quiet);
    return { outcome, answers, said: answers.map((a) => a.text).join("\n") };
  };
}

async function setup(rule: SubmissionRule = "overwrite") {
  const w = await workspace(); cleanups.push(w.cleanup);
  const mark = randomUUID().slice(0, 8);
  const address = `ann-${mark}@example.test`;
  const sara = await w.person("owner", { email: `sara-${mark}@example.test` });
  const ann = await w.person("member", { email: address });
  const ben = await w.person("member", { email: `ben-${mark}@example.test` });
  const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "mail"], submission_rule: rule });
  await w.share(m.id, ann);
  const code = await w.token(m.id, ann);
  await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
  const [d] = (await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ann })) as { id: number }[];
  const values = async () => (await valuesOf(m.id)).map((v) => v.value);
  const notes = async () => (await periodValueNotes(w.actor(sara), m.id, NOW))?.current.map((n) => n.words) ?? [];
  const history = async () => (await periodValueNotes(w.actor(sara), m.id, NOW))?.history ?? [];
  const offers = async () => rowsOf("reply_offers", { delivery_id: d!.id });
  const form = (value: number) => submitValue({ source: "web_form", sender: code, text: String(value), workspaceId: w.id }, quiet);
  return { w, sara, ann, ben, m, code, address, deliveryId: d!.id, reply: replier(d!.id, address), values, notes, history, offers, form };
}

/** The same, with 45 sent by reply. */
async function sent(rule: SubmissionRule = "overwrite") {
  const s = await setup(rule);
  expect((await s.reply("45")).outcome).toBe("recorded");
  return s;
}

describe("the first reply", () => {
  it("records the number and saves the lines under it as the note, which the intake log never holds", async () => {
    const s = await setup();
    const r = await s.reply("45\r\nThree deals slipped.");
    expect(r.outcome).toBe("recorded");
    expect(r.answers).toEqual([expect.objectContaining({ subject: "Recorded", text: expect.stringContaining("Your note was saved.") })]);
    expect(await s.values()).toEqual([45]);
    expect(await s.notes()).toEqual(["Three deals slipped."]);
    const log = await opened("intake_log", s.w.id, await rowsOf("intake_log", { workspace_id: s.w.id }));
    expect(JSON.stringify(log)).not.toContain("slipped");
  });

  it("takes words alone as no note, as before, and a number refused saves none", async () => {
    const s = await setup("reject");
    expect(await s.reply("Next week, sorry")).toMatchObject({ outcome: "refused", said: expect.stringContaining("Couldn’t find a number") });
    expect((await s.reply("45")).outcome).toBe("recorded");
    expect((await s.reply("46\r\nA second try")).outcome).toBe("refused");
    expect(await s.notes()).toEqual([]);
  });

  it("keeps no form link that the reply quotes", async () => {
    const s = await sent();
    const code = "A".repeat(43);
    await s.reply(`See https://ziffr.example.test/submit/all/${code} and /submit/tk-${"b".repeat(24)}`);
    const [note] = await s.notes();
    expect(note).toContain("/submit/…");
    expect(note).not.toContain(code);
    expect(note).not.toContain("tk-bbbb");
  });
});

describe("a later reply", () => {
  it("is a new value when it is a number alone, also after 1: or Correction:, or a Breakdown", async () => {
    const s = await sent();
    for (const [text, value] of [["47", 47], ["1: 48", 48], ["Correction: 49", 49], ["North 20\r\nSouth 30", 50]] as const) {
      expect((await s.reply(text)).outcome).toBe("recorded");
      expect(await s.values()).toEqual([value]);
    }
    expect((await s.reply("51\r\nCounted again.")).outcome).toBe("recorded");
    expect(await s.notes()).toEqual(["Counted again."]);
  });

  it("closes without saving for thanks or a refusal alone, with no answer", async () => {
    const s = await sent();
    for (const text of ["thanks", "no", "-"]) expect(await s.reply(text)).toMatchObject({ outcome: "closed", answers: [] });
    expect(await s.values()).toEqual([45]);
    expect(await s.notes()).toEqual([]);
  });

  it("is the note for any other words, with no email back; a second one takes its place and says so", async () => {
    const s = await sent();
    expect(await s.reply("The big deal moved to next month.")).toMatchObject({ outcome: "noted", answers: [] });
    expect(await s.notes()).toEqual(["The big deal moved to next month."]);
    expect((await s.reply("It moved to January.")).outcome).toBe("noted");
    expect(await s.notes()).toEqual(["It moved to January."]);
    expect((await s.history()).map((e) => [e.kind, e.words])).toEqual([["written", "The big deal moved to next month."], ["corrected", "It moved to January."]]);
    expect(await s.values()).toEqual([45]);
  });

  it("says so in the chat when the second note takes the first one's place", async () => {
    const s = await sent();
    await s.reply("One");
    const { data: d } = await db().from("deliveries").select(COLUMNS).eq("id", s.deliveryId).single();
    await db().from("deliveries").update({ answer_source: "slack" }).eq("id", s.deliveryId);
    await db().from("metrics").update({ sources: ["web_form", "mail", "slack"] }).eq("id", s.m.id);
    const said: string[] = [];
    await routeReply(d as RepliedDelivery, "Two", { source: "slack", sender: "slack:U1", provenPersonId: s.ann, answer: async (_s, text) => { said.push(text); } }, quiet);
    expect(said).toEqual(["Saved as your note, in place of your earlier one."]);
  });

  it("is not saved once the person is no longer asked, nor on an Archived Metric", async () => {
    const s = await sent();
    await db().from("tokens").delete().eq("metric_id", s.m.id);
    expect(await s.reply("Late words")).toMatchObject({ outcome: "refused", said: expect.stringContaining("no longer yours") });
    await s.w.token(s.m.id, s.ann);
    await archiveMetric(s.w.actor(s.sara), s.m.id);
    expect(await s.reply("Later words")).toMatchObject({ outcome: "refused", said: expect.stringContaining("archived") });
    expect(await s.notes()).toEqual([]);
  });

  it("files the note under the person's own earlier value once someone else replaced it, and offers nothing", async () => {
    const s = await sent();
    await s.w.token(s.m.id, s.ben);
    const [o] = await rowsOf("observations", { metric_id: s.m.id });
    await db().from("observations").update({ value: 60, value_sealed: null, submitter_id: s.ben }).eq("id", o!.id);
    const r = await s.reply("It was 47 by my count");
    expect(r.outcome).toBe("noted");
    expect(r.said).toContain("filed under your earlier value");
    expect(r.said).not.toContain("reply yes");
    expect(await s.offers()).toEqual([]);
    expect(await s.notes()).toEqual([]);
    expect(await s.history()).toEqual([expect.objectContaining({ words: "It was 47 by my count", saidOf: 45 })]);
  });
});

describe("the offer", () => {
  it("is made for one other number, and yes records it with the words as its note", async () => {
    const s = await sent();
    const r = await s.reply("Actually 47, one order came in late.");
    expect(r.outcome).toBe("noted");
    expect(r.answers).toEqual([{ subject: "Your note", text: "Saved as your note. Your value is still 45. To change it to 47, reply yes.", invites: true }]);
    expect(await s.values()).toEqual([45]);
    const [kept] = await s.offers();
    expect(JSON.stringify(kept)).not.toContain("order");
    const yes = await s.reply("Yes\r\n\r\nBest regards\r\nAnn");
    expect(yes.outcome).toBe("recorded");
    expect(await s.values()).toEqual([47]);
    expect(await s.notes()).toEqual(["Actually 47, one order came in late."]);
    expect(await s.offers()).toEqual([]);
    expect((await s.reply("yes")).said).toContain("no open offer");
    expect(await s.values()).toEqual([47]);
  });

  it.each([
    ["add", "To add 3, reply yes.", [48]],
    ["keep_both", "Your value is still 45. To record 3 as well, reply yes.", [45, 3]],
  ] as const)("follows the Submission Rule %s", async (rule, words, after) => {
    const s = await sent(rule);
    expect((await s.reply("3 more came in")).said).toContain(words);
    expect((await s.reply("yes")).outcome).toBe("recorded");
    expect(await s.values()).toEqual([...after]);
    // The words show once, with the value they brought.
    expect(await s.notes()).toEqual(["3 more came in"]);
  });

  it("is not made where a second value is refused, nor for several numbers or the same number", async () => {
    const rejecting = await sent("reject");
    expect((await rejecting.reply("3 more came in")).said).toBe("Saved as your note.");
    expect(await rejecting.offers()).toEqual([]);
    const s = await sent();
    expect((await s.reply("3 of the 7 deals slipped")).said).toBe("Saved as your note. To change the value, send the number alone.");
    expect((await s.reply("still 45, checked")).said).toBe("Saved as your note, in place of your earlier one.");
    expect(await s.offers()).toEqual([]);
    expect((await s.reply("yes")).said).toContain("no open offer");
    expect(await s.values()).toEqual([45]);
  });

  it("proposes the Correction in a locked period, changing nothing", async () => {
    const s = await sent();
    await s.w.lock(s.m.id, NOW);
    expect((await s.reply("It should be 47")).said).toContain("To propose 47 as a correction, reply yes.");
    const r = await s.reply("yes");
    expect(r.said).toContain("proposed correction");
    expect(await s.values()).toEqual([45]);
    const messages = await rowsOf("thread_messages", {});
    expect(messages.length).toBeGreaterThan(0);
  });

  it("is closed by any other reply, and ok is no yes", async () => {
    const s = await sent();
    await s.reply("Could be 47");
    expect((await s.reply("ok")).outcome).toBe("noted");
    expect(await s.offers()).toEqual([]);
    expect((await s.reply("yes")).said).toContain("no open offer");
    await s.reply("Could be 47");
    await s.reply("thanks");
    await s.reply("yes");
    expect(await s.values()).toEqual([45]);
  });

  it("is closed by a change of the value or of the rule by any way, and by removing the note", async () => {
    const s = await sent();
    await s.reply("Could be 47");
    expect((await s.form(46)).ok).toBe(true);
    expect((await s.reply("yes")).said).toContain("no open offer");
    expect(await s.values()).toEqual([46]);
    await s.reply("Or rather 48");
    await db().from("metrics").update({ submission_rule: "add" }).eq("id", s.m.id);
    await s.reply("yes");
    expect(await s.values()).toEqual([46]);
    await db().from("metrics").update({ submission_rule: "overwrite" }).eq("id", s.m.id);
    await s.reply("Or even 49");
    const id = (await periodValueNotes(s.w.actor(s.sara), s.m.id, NOW))!.current[0]!.id;
    await removeValueNote(s.w.actor(s.sara), id);
    await s.reply("yes");
    expect(await s.values()).toEqual([46]);
  });

  it("is not taken once the person is no longer asked", async () => {
    const s = await sent();
    await s.reply("Could be 47");
    await db().from("tokens").delete().eq("metric_id", s.m.id);
    await s.reply("yes");
    expect(await s.values()).toEqual([45]);
  });

  it("takes the place of a note written in the app, which the history keeps", async () => {
    const s = await sent();
    await writeValueNote(s.w.actor(s.ann, "member"), { metricId: s.m.id, period: NOW, words: "From the app" });
    expect((await s.reply("From the email")).said).toBe("");
    expect(await s.notes()).toEqual(["From the email"]);
  });
});

/** Ann is asked for three Metrics in one message. */
async function several() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const mark = randomUUID().slice(0, 8);
  const address = `ann-${mark}@example.test`;
  const sara = await w.person("owner", { email: `sara-${mark}@example.test` });
  const ann = await w.person("member", { email: address });
  const made = async (name: string, sources = ["web_form", "mail"]) => {
    const m = await w.metric(sara, { name, sources });
    await w.share(m.id, ann); await w.token(m.id, ann);
    return m;
  };
  const metrics = [await made("Revenue"), await made("Costs"), await made("Visits", ["web_form"])];
  const more = await made("Leads");
  await askForMissingValues(w.actor(sara));
  const [d] = (await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ann })) as { id: number }[];
  const at = async (metricId: number) => Number((await rowsOf("delivery_prompts", { delivery_id: d!.id, metric_id: metricId }))[0]!.position);
  const positions = { revenue: await at(metrics[0]!.id), costs: await at(metrics[1]!.id), visits: await at(metrics[2]!.id), leads: await at(more.id) };
  const values = async (i: number) => (await valuesOf(metrics[i]!.id)).map((v) => v.value);
  const row = async () => (await opened("deliveries", w.id, await rowsOf("deliveries", { id: d!.id })))[0]!;
  return { w, sara, ann, metrics, leads: more, deliveryId: d!.id, positions, reply: replier(d!.id, address), values, row };
}

describe("a reply to a message with several figures", () => {
  it("records each numbered line with its note and lists what is still open", async () => {
    const s = await several();
    const p = s.positions;
    const r = await s.reply(`${p.revenue}: 45\r\nTwo deals moved.\r\n${p.costs}: 7\r\n${p.visits}: 3`);
    expect(r.outcome).toBe("recorded");
    expect(r.said).toContain("Note: “Two deals moved.”");
    expect(r.said).toContain(`${p.visits}. Not recorded: Visits takes values only on the form.`);
    expect(r.said).toContain(`Still open: ${p.leads}. Leads`);
    expect([await s.values(0), await s.values(1), await s.values(2)]).toEqual([[45], [7], []]);
    expect((await s.row()).status).toBe("sent");
  });

  it("takes numbers alone in order only when there is one for each open figure", async () => {
    const s = await several();
    expect(await s.reply("45\r\n7")).toMatchObject({ outcome: "refused", said: expect.stringContaining("Nothing was recorded") });
    expect(await s.values(0)).toEqual([]);
    expect((await s.reply("45\r\n7\r\n9")).outcome).toBe("recorded");
    const recorded = [await s.values(0), await s.values(1), (await valuesOf(s.leads.id)).map((v) => v.value)];
    expect(recorded.flat().sort()).toEqual([45, 7, 9].sort());
    expect(await s.values(2)).toEqual([]);
  });

  it("asks which figure words are about, and takes them with a number in front", async () => {
    const s = await several();
    const p = s.positions;
    await s.reply(`${p.revenue}: 45\r\n${p.costs}: 7`);
    const r = await s.reply("A slow month.");
    expect(r.said).toContain("which number are your words about?");
    expect(r.answers[0]!.invites).toBe(true);
    expect(await rowsOf("value_notes", { workspace_id: s.w.id })).toEqual([]);
    expect((await s.reply(`${p.costs}: A slow month.`)).outcome).toBe("noted");
    expect(await rowsOf("value_notes", { metric_id: s.metrics[1]!.id })).toHaveLength(1);
    // An offer in such a message takes the number for that figure alone.
    expect((await s.reply(`${p.costs}: it was 8`)).said).toContain("To change it to 8, reply yes.");
    expect((await s.reply("yes")).outcome).toBe("recorded");
    expect([await s.values(0), await s.values(1)]).toEqual([[45], [8]]);
  });

  it("names nothing of a figure no longer asked of the person", async () => {
    const s = await several();
    const p = s.positions;
    await db().from("tokens").delete().eq("metric_id", s.metrics[0]!.id);
    const r = await s.reply(`${p.revenue}: 45`);
    expect(r.said).toContain("no longer asked of you");
    expect(r.said).not.toContain("Revenue");
    expect(await s.values(0)).toEqual([]);
  });

  it("takes 2 more replies for each figure, at most 60", async () => {
    const s = await several();
    expect(await repliesAllowed(s.deliveryId, 20)).toBe(28);
    expect(await repliesAllowed(-1, 20)).toBe(20);
  });
});

describe("figures that stop being asked", () => {
  it("leave an unsent message when a Submitter is removed, and it is not sent once nothing is left", async () => {
    const s = await several();
    await removeSubmitters(s.w.actor(s.sara), s.metrics[0]!.id, [s.ann]);
    expect((await s.row()).body).not.toContain("Revenue");
    expect((await s.row()).body).toContain("Costs");
    for (const m of [s.metrics[1]!, s.metrics[2]!, s.leads]) await removeSubmitters(s.w.actor(s.sara), m.id, [s.ann]);
    expect((await s.row()).mail_state).toBe("failed");
  });

  it("leave an unsent message when a Metric is archived", async () => {
    const s = await several();
    await archiveMetric(s.w.actor(s.sara), s.metrics[1]!.id);
    expect((await s.row()).body).not.toContain("Costs");
    for (const m of [s.metrics[0]!, s.metrics[2]!, s.leads]) await archiveMetric(s.w.actor(s.sara), m.id);
    expect(await s.row()).toMatchObject({ mail_state: "failed", last_error: expect.stringContaining("archived") });
  });

  it("change nothing about the words of a message already sent; a deleted Metric only marks it", async () => {
    const s = await several();
    await db().from("deliveries").update({ mail_state: "sent" }).eq("id", s.deliveryId);
    const before = (await s.row()).body;
    const promptIds = (await rowsOf("delivery_prompts", { delivery_id: s.deliveryId })).map((r) => Number(r.prompt_id));
    await holdCombined(s.w.id, promptIds, ["queued", "outbox"], "Not sent.");
    await deleteMetric(s.w.actor(s.sara), s.metrics[0]!.id, "Revenue");
    expect(await s.row()).toMatchObject({ body: before, mail_state: "sent", last_error: METRIC_DELETED_SINCE });
    // The number it had stays where it was sent: the others answer to theirs.
    expect((await s.reply(`${s.positions.costs}: 7`)).outcome).toBe("recorded");
    expect(await s.values(1)).toEqual([7]);
  });
});
