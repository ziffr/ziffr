// The Answer Languages against the real database (spec 0022, ticket #118): English plus the country's languages
// until an Owner or Admin chooses, nobody else chooses, never in the demo, only languages Ziffr has words for;
// audited. Only the chosen languages are tried when an answer is read, and the country decides the order of a date.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { periodStart, shiftPeriod, JANUARY } from "./periods";
import { submitValue } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { answerReadingOf, setAnswerLanguages, setWorkspaceProfile, workspaceAnswerLanguages } from "./workspace-settings";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const quiet = () => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });

describe("the Answer Languages", () => {
  it("follow the country until an Owner or Admin chooses, and are audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const gus = await w.person("guest");
    const owner = w.actor(sara);
    expect(await workspaceAnswerLanguages(owner)).toEqual({ languages: ["en"], chosen: false, fromCountry: null });
    await setWorkspaceProfile(owner, { country: "BE" });
    expect(await workspaceAnswerLanguages(w.actor(gus, "guest"))).toEqual({ languages: ["en", "nl", "fr"], chosen: false, fromCountry: "BE" });
    await setWorkspaceProfile(owner, { country: "US" });
    expect(await answerReadingOf(w.id)).toEqual({ languages: ["en"], monthFirst: true });

    expect(await setAnswerLanguages(owner, ["fr", "en"])).toEqual(["en", "fr"]);
    await setWorkspaceProfile(owner, { country: "DE" });
    expect(await workspaceAnswerLanguages(owner)).toEqual({ languages: ["en", "fr"], chosen: true, fromCountry: null });
    await setAnswerLanguages(w.actor(ann, "admin"), ["es"]);
    // The same languages again change nothing and record nothing.
    await setAnswerLanguages(owner, ["es"]);
    const { data } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "workspace.answer_languages_changed").order("id");
    expect(data?.map((r) => r.details)).toEqual([{ from: null, followed: "country", to: ["en", "fr"] }, { from: ["en", "fr"], to: ["es"] }]);
  });

  it("refuses Members, Guests, Access Keys, the demo and languages Ziffr has no words for", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(setAnswerLanguages(w.actor(ben, "member"), ["en"])).rejects.toEqual(expect.any(Forbidden));
    await expect(setAnswerLanguages(w.actor(gus, "guest"), ["en"])).rejects.toEqual(expect.any(Forbidden));
    await expect(setAnswerLanguages({ ...w.actor(sara), key: { id: "k1", scopes: ["values:write"] } } as never, ["en"])).rejects.toEqual(expect.any(Forbidden));
    await expect(setAnswerLanguages({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, ["en"])).rejects.toEqual(expect.any(Forbidden));
    for (const bad of [[], ["xx"], "en", null, ["en", 1]]) await expect(setAnswerLanguages(w.actor(sara), bad)).rejects.toThrow(/Answer Languages/);
    // The column's check holds even for a write that skips the core.
    const { error } = await db().from("workspaces").update({ answer_languages: ["EN; drop"] }).eq("id", w.id);
    expect(error).not.toBeNull();
    // A stored code Ziffr has no words for is skipped; with none left the country decides.
    await db().from("workspaces").update({ answer_languages: ["xx"] }).eq("id", w.id);
    expect(await workspaceAnswerLanguages(w.actor(sara))).toEqual({ languages: ["en"], chosen: false, fromCountry: null });
  });

  it("tries only the chosen languages when an answer is read", async () => {
    const w = await ws(); const ann = await w.person("owner"); const m = await w.metric(ann, { name: "Inscriptions", period: "week" }); const code = await w.token(m.id, ann);
    const lastWeek = shiftPeriod(periodStart(new Date(), "week", JANUARY), "week", -1);
    const periods = async () => (await db().from("observations").select("period_start").eq("metric_id", m.id)).data!.map((o) => String(o.period_start));
    // Not yet a language of the workspace: "la semaine dernière" names nothing, and 2 goes to this week.
    await submitValue({ source: "web_form", sender: code, text: "la semaine dernière 2" }, quiet());
    expect(await periods()).toEqual([periodStart(new Date(), "week", JANUARY)]);
    await setAnswerLanguages(w.actor(ann), ["en", "fr"]);
    const r = await submitValue({ source: "web_form", sender: code, text: "la semaine dernière 2" }, quiet());
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    expect((await periods()).sort()).toEqual([lastWeek, periodStart(new Date(), "week", JANUARY)].sort());
  });
});
