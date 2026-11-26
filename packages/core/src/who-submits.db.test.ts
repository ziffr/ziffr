// Who submits on a Metric's page, against the database (GLOSSARY: Submitter): whom the owner and Editors are offered,
// that adding says what was sent and asks only when told to, and that removing someone stops what waits to reach them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { REMOVED_BEFORE_SENT } from "./asked-message";
import { addSubmitters, ONLY_OWNER_ADDS_UNSEEN, removeSubmitters, type MetricEffects } from "./metrics";
import { addSubmitterWithAnswer, submitterChoices } from "./who-submits";
import { auditRowsOf, insertRow, rowsOf, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
/** Effects that send nothing and note who would have been asked. */
function noSending() {
  const promptSubmitter = vi.fn(async () => ({ connector: "email" as const, state: "queued" as const, chosen: true }));
  return { effects: { recordCreated: async () => undefined, promptSubmitter } satisfies MetricEffects, promptSubmitter };
}

describe("whom the owner and Editors may add", () => {
  it("lists Members, Guests and Contacts who do not submit yet, with their kind and no contact details", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gil = await w.person("guest");
    const mia = await w.contact({ email: "mia@example.test", phone: "+49 170 0000000" });
    const m = await w.metric(sara); await w.token(m.id, ben);
    const choices = await submitterChoices(w.actor(sara), m.id);
    expect(new Map(choices.map((c) => [c.id, c.kind]))).toEqual(new Map([[sara, "member"], [gil, "guest"], [mia, "contact"]]));
    expect(Object.keys(choices[0]).sort()).toEqual(["id", "kind", "name"]);
  });

  it("gives nobody else a list, and none for a Derived Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gil = await w.person("guest");
    const m = await w.metric(sara); await w.share(m.id, ben); await w.token(m.id, gil);
    expect(await submitterChoices(w.actor(ben, "member"), m.id)).toEqual([]);
    expect(await submitterChoices(w.actor(gil, "guest"), m.id)).toEqual([]);
    const derived = await w.metric(sara, { formula: `{${m.slug}} * 2` });
    expect(await submitterChoices(w.actor(sara), derived.id)).toEqual([]);
    const other = await ws(); const olga = await other.person("owner");
    expect(await submitterChoices(other.actor(olga), m.id)).toEqual([]);
  });
});

describe("an Editor", () => {
  it("is offered and adds only people who see the Metric already, whatever their Workspace Role", async () => {
    const w = await ws(); const sara = await w.person("owner"); const eve = await w.person("admin");
    const ben = await w.person("member"); const ana = await w.person("member"); const mia = await w.contact({ email: "mia@example.test" });
    const m = await w.metric(sara);
    await insertRow("shares", { workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: eve, role: "editor" });
    await w.share(m.id, ben);
    const editor = w.actor(eve, "admin");
    const { effects, promptSubmitter } = noSending();
    expect((await submitterChoices(editor, m.id)).map((c) => c.id).sort()).toEqual([ben, eve, sara].sort());
    // One person who does not see it refuses the whole change.
    for (const ids of [[ana], [mia], [ben, ana]]) await expect(addSubmitters(editor, m.id, ids, effects)).rejects.toThrow(ONLY_OWNER_ADDS_UNSEEN);
    await expect(addSubmitterWithAnswer(editor, m.id, ana, true, effects)).rejects.toBeInstanceOf(Forbidden);
    expect(await rowsOf("tokens", { metric_id: m.id })).toEqual([]);
    expect(await auditRowsOf(w.id, "metric.submitter")).toEqual([]);
    expect(promptSubmitter).not.toHaveBeenCalled();
    expect(await addSubmitters(editor, m.id, [ben], effects)).toEqual([ben]);
    // The owner adds anyone; from then on that person sees it, and the Editor may name them.
    expect(await addSubmitters(w.actor(sara), m.id, [ana, mia], effects)).toEqual([ana, mia]);
    expect(await addSubmitters(editor, m.id, [ana], effects)).toEqual([]);
  });
});

describe("adding a person", () => {
  it("gives them a Token and asks only when told to", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ana = await w.person("member");
    const m = await w.metric(sara);
    const { effects, promptSubmitter } = noSending();
    expect(await addSubmitterWithAnswer(w.actor(sara), m.id, ben, false, effects)).toBe("Nothing was sent to them now.");
    expect(promptSubmitter).not.toHaveBeenCalled();
    expect(await addSubmitterWithAnswer(w.actor(sara), m.id, ana, true, effects)).toContain("will get a form link and a first request shortly");
    expect(promptSubmitter).toHaveBeenCalledExactlyOnceWith(m.id, ana, sara);
    expect((await rowsOf("tokens", { metric_id: m.id })).map((t) => t.submitter_id).sort()).toEqual([ana, ben].sort());
    expect(await addSubmitterWithAnswer(w.actor(sara), m.id, ben, true, effects)).toBe("They submit it already.");
    expect(promptSubmitter).toHaveBeenCalledTimes(1);
  });

  it("is refused to anyone but the owner and Editors, and for a person of another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const other = await ws(); const olga = await other.person("owner");
    const m = await w.metric(sara); await w.share(m.id, ben);
    const { effects, promptSubmitter } = noSending();
    await expect(addSubmitterWithAnswer(w.actor(ben, "member"), m.id, ben, true, effects)).rejects.toBeInstanceOf(Forbidden);
    await expect(addSubmitterWithAnswer(w.actor(sara), m.id, olga, true, effects)).rejects.toBeInstanceOf(Forbidden);
    expect(promptSubmitter).not.toHaveBeenCalled();
    expect(await rowsOf("tokens", { metric_id: m.id })).toEqual([]);
  });
});

describe("asking once, and the Audit Log", () => {
  it("makes one first request a day for a person and a Metric, and says so", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const second = await w.metric(sara);
    const { effects, promptSubmitter } = noSending();
    await addSubmitterWithAnswer(w.actor(sara), m.id, ben, true, effects);
    await removeSubmitters(w.actor(sara), m.id, [ben]);
    expect(await addSubmitterWithAnswer(w.actor(sara), m.id, ben, true, effects)).toBe("They were asked for this Metric in the last day, so no new request was made.");
    expect(promptSubmitter).toHaveBeenCalledTimes(1);
    // Added all the same; another Metric of theirs is asked for.
    expect(await rowsOf("tokens", { metric_id: m.id })).toHaveLength(1);
    await addSubmitterWithAnswer(w.actor(sara), second.id, ben, true, effects);
    expect(promptSubmitter).toHaveBeenCalledTimes(2);
  });

  it("writes who was added, whether they were asked, and who was removed", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ana = await w.person("member");
    const m = await w.metric(sara);
    const { effects } = noSending();
    await addSubmitterWithAnswer(w.actor(sara), m.id, ben, true, effects);
    await addSubmitterWithAnswer(w.actor(sara), m.id, ana, false, effects);
    await removeSubmitters(w.actor(sara), m.id, [ben]);
    // Neither adding someone who submits nor removing someone who does not is an event.
    await addSubmitters(w.actor(sara), m.id, [ana], effects);
    await removeSubmitters(w.actor(sara), m.id, [ben]);
    const rows = await auditRowsOf(w.id, "metric.submitter");
    expect(rows.map((r) => [r.kind, (r.details as { person_id: string }).person_id, (r.details as { ask_now?: boolean }).ask_now])).toEqual([
      ["metric.submitter_added", ben, true], ["metric.submitter_added", ana, false], ["metric.submitter_removed", ben, undefined],
    ]);
  });
});

describe("removing a person", () => {
  it("holds the Prompts waiting or kept for their Tokens and their Stand-in's, and leaves others to go", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ana = await w.person("member"); const max = await w.person("member");
    const m = await w.metric(sara);
    await w.token(m.id, ben, { stand_in_id: ana }); await w.token(m.id, max);
    await w.token(m.id, ana, { stands_in_for: ben });
    const tokens = await rowsOf("tokens", { metric_id: m.id });
    const waiting = async (recipient: string, token: number, state = "queued") => (await insertRow("deliveries", { workspace_id: w.id, connector: "email", recipient_id: recipient, kind: "prompt", subject: "A request", body: "What is it?", mail_state: state, form_token_id: token })).id;
    const id = (person: string, standsFor: string | null = null) => Number(tokens.find((t) => t.submitter_id === person && (t.stands_in_for ?? null) === standsFor)!.id);
    const toBen = await waiting(ben, id(ben)); const toAna = await waiting(ana, id(ana, ben)); const toMax = await waiting(max, id(max));
    // One kept in the Outbox, and one made while the Token was going, which names its Prompt and no Token.
    const kept = await waiting(ben, id(ben), "outbox");
    const prompt = await insertRow("prompts", { workspace_id: w.id, metric_id: m.id, submitter_id: ben, source: "web_form", text: "What is it?", period_start: "2026-11-01" });
    const late = (await insertRow("deliveries", { workspace_id: w.id, connector: "email", recipient_id: ben, kind: "prompt", subject: "A request", body: "What is it?", mail_state: "queued", prompt_id: prompt.id })).id;

    expect(await removeSubmitters(w.actor(sara), m.id, [ben])).toEqual([ben]);

    const state = async (delivery: number) => (await rowsOf("deliveries", { id: delivery }))[0];
    for (const held of [toBen, toAna, kept, late]) expect(await state(held)).toMatchObject({ mail_state: "failed", last_error: REMOVED_BEFORE_SENT });
    expect(await state(toMax)).toMatchObject({ mail_state: "queued" });
    expect((await rowsOf("tokens", { metric_id: m.id })).map((t) => t.submitter_id)).toEqual([max]);
  });
});
