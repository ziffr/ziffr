// Who submits on a Metric's page, against the database (GLOSSARY: Submitter): whom the owner and Editors are offered,
// that adding says what was sent and asks only when told to, and that removing someone stops what waits to reach them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { REMOVED_BEFORE_SENT } from "./asked-message";
import { removeSubmitters, type MetricEffects } from "./metrics";
import { addSubmitterWithAnswer, submitterChoices } from "./who-submits";
import { insertRow, rowsOf, workspace } from "./test/db-fixtures";

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

describe("removing a person", () => {
  it("holds the Prompts waiting for their Tokens and their Stand-in's, and leaves others to go", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ana = await w.person("member"); const max = await w.person("member");
    const m = await w.metric(sara);
    await w.token(m.id, ben, { stand_in_id: ana }); await w.token(m.id, max);
    await w.token(m.id, ana, { stands_in_for: ben });
    const tokens = await rowsOf("tokens", { metric_id: m.id });
    const waiting = async (recipient: string, token: number) => (await insertRow("deliveries", { workspace_id: w.id, connector: "email", recipient_id: recipient, kind: "prompt", subject: "A request", body: "What is it?", mail_state: "queued", form_token_id: token })).id;
    const id = (person: string, standsFor: string | null = null) => Number(tokens.find((t) => t.submitter_id === person && (t.stands_in_for ?? null) === standsFor)!.id);
    const toBen = await waiting(ben, id(ben)); const toAna = await waiting(ana, id(ana, ben)); const toMax = await waiting(max, id(max));

    expect(await removeSubmitters(w.actor(sara), m.id, [ben])).toEqual([ben]);

    const state = async (delivery: number) => (await rowsOf("deliveries", { id: delivery }))[0];
    for (const held of [toBen, toAna]) expect(await state(held)).toMatchObject({ mail_state: "failed", last_error: REMOVED_BEFORE_SENT });
    expect(await state(toMax)).toMatchObject({ mail_state: "queued" });
    expect((await rowsOf("tokens", { metric_id: m.id })).map((t) => t.submitter_id)).toEqual([max]);
  });
});
