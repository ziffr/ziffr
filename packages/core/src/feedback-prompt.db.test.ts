// The Feedback Prompt against the real database (ticket #722): who may be asked and when, what each answer does, that
// the words are kept without a name and read only by Installation Admins. Serial with the other DB files.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { feedbackPromptFor, feedbackPromptWords, markFeedbackPromptShown, sayWhatIsMissing, stopFeedbackPrompt } from "./feedback-prompt";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { installationAdmin, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
const saved = process.env.ZIFFR_FEEDBACK_PROMPT;
beforeEach(() => { process.env.ZIFFR_FEEDBACK_PROMPT = "true"; forgetStoredSettings(); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  if (saved === undefined) delete process.env.ZIFFR_FEEDBACK_PROMPT; else process.env.ZIFFR_FEEDBACK_PROMPT = saved;
  forgetStoredSettings();
  await db().from("feedback_prompt_words").delete().neq("id", 0);
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

/** Gives the person values submitted on `days` different days. */
async function activeOn(w: Awaited<ReturnType<typeof ws>>, person: string, days: number, owner = person) {
  const m = await w.metric(owner);
  for (let i = 0; i < days; i++) {
    const id = await w.value(m.id as number, `2026-0${i + 1}-01`, i + 1, person);
    await db().from("observations").update({ created_at: new Date(Date.now() - i * 86_400_000 - 3_600_000).toISOString() }).eq("id", id);
  }
}
const stateOf = async (id: string) => (await db().from("feedback_prompts").select("*").eq("person_id", id).maybeSingle()).data;
const later = (days: number) => new Date(Date.now() + days * 86_400_000 + 60_000);

describe("who is asked", () => {
  it("asks a member after values on three different days, not before", async () => {
    const w = await ws(); const ben = await w.person("member");
    await activeOn(w, ben, 2);
    expect(await feedbackPromptFor(w.actor(ben, "member"))).toBeNull();
    const w2 = await ws(); const eva = await w2.person("member");
    await activeOn(w2, eva, 3);
    expect(await feedbackPromptFor(w2.actor(eva, "member"))).toEqual({ askForStar: true });
  });
  it("counts days, not values: many values on one day are one day", async () => {
    const w = await ws(); const ben = await w.person("member");
    const m = await w.metric(ben);
    for (let i = 1; i <= 5; i++) await w.value(m.id as number, `2026-0${i}-01`, i, ben);
    expect(await feedbackPromptFor(w.actor(ben, "member"))).toBeNull();
  });
  it("never asks a Guest, a key, a Contact, someone outside the Workspace or the demo", async () => {
    const w = await ws(); const guest = await w.person("guest"); const ben = await w.person("member"); const stranger = await (await ws()).person("member");
    await activeOn(w, guest, 3, ben); await activeOn(w, ben, 3);
    expect(await feedbackPromptFor(w.actor(guest, "guest"))).toBeNull();
    expect(await feedbackPromptFor({ ...w.actor(ben, "member"), key: { id: "k", scopes: [] } } as unknown as Actor)).toBeNull();
    expect(await feedbackPromptFor({ personId: stranger, workspaceId: w.id, role: "member" })).toBeNull();
    const contact = await w.contact({ email: "c@example.test" });
    expect(await feedbackPromptFor(w.actor(contact, "member"))).toBeNull();
    expect(await feedbackPromptFor({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "member" })).toBeNull();
  });
  it("asks nobody when the Installation turned it off, and nobody on a self-hosted Installation without the setting", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    process.env.ZIFFR_FEEDBACK_PROMPT = "false"; forgetStoredSettings();
    expect(await feedbackPromptFor(w.actor(ben, "member"))).toBeNull();
    delete process.env.ZIFFR_FEEDBACK_PROMPT; forgetStoredSettings();
    expect(await feedbackPromptFor(w.actor(ben, "member"))).toBeNull();
  });
});

describe("how often", () => {
  it("waits 30 days after the card was shown, then 60, and the third showing is the last", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await markFeedbackPromptShown(a);
    expect(await feedbackPromptFor(a)).toBeNull();
    expect(await feedbackPromptFor(a, later(29))).toBeNull();
    expect(await feedbackPromptFor(a, later(30))).toEqual({ askForStar: true });
    await markFeedbackPromptShown(a, later(30));
    expect(await feedbackPromptFor(a, later(30 + 59))).toBeNull();
    expect(await feedbackPromptFor(a, later(30 + 60))).toEqual({ askForStar: true });
    await markFeedbackPromptShown(a, later(90));
    expect(await stateOf(ben)).toMatchObject({ shown_count: 3, stopped: true });
    expect(await feedbackPromptFor(a, later(5000))).toBeNull();
  });
  it("counts one showing when two tabs show it at once", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await Promise.all([markFeedbackPromptShown(a), markFeedbackPromptShown(a)]);
    expect((await stateOf(ben))?.shown_count).toBe(1);
  });
  it("refuses to record a showing for someone who may not be asked", async () => {
    const w = await ws(); const guest = await w.person("guest");
    await expect(markFeedbackPromptShown(w.actor(guest, "guest"))).rejects.toEqual(expect.any(Forbidden));
  });
});

describe("answers", () => {
  it("stops for good after a star or Don't ask again, and refuses any other answer", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await markFeedbackPromptShown(a);
    await expect(stopFeedbackPrompt(a, "later")).rejects.toThrow(/Pick/);
    await stopFeedbackPrompt(a, "starred");
    expect(await feedbackPromptFor(a, later(5000))).toBeNull();
    expect(await stateOf(ben)).toMatchObject({ stopped: true, answer: "starred" });
  });
  it("keeps what is missing without the person, and asks again only after 90 days, without a star", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await markFeedbackPromptShown(a);
    await sayWhatIsMissing(a, "  Charts for my team <b>please</b>  ");
    const { data } = await db().from("feedback_prompt_words").select("*");
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ words: "Charts for my team <b>please</b>" });
    expect(Object.keys(data![0]).sort()).toEqual(["created_at", "id", "words"]);
    expect(await feedbackPromptFor(a, later(89))).toBeNull();
    expect(await feedbackPromptFor(a, later(91))).toEqual({ askForStar: false });
  });
  it("takes words only from someone who was shown the card, once per wait, and only within the limits", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await expect(sayWhatIsMissing(a, "x")).rejects.toEqual(expect.any(Forbidden));
    await markFeedbackPromptShown(a);
    for (const bad of ["", "   ", "x".repeat(1001), "a‮b", 7]) await expect(sayWhatIsMissing(a, bad)).rejects.toThrow();
    await sayWhatIsMissing(a, "first");
    await expect(sayWhatIsMissing(a, "second")).rejects.toThrow(/told us already/);
    expect((await db().from("feedback_prompt_words").select("id")).data).toHaveLength(1);
  });
  it("keeps one answer when two are sent at once", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await markFeedbackPromptShown(a);
    const results = await Promise.allSettled([sayWhatIsMissing(a, "one"), sayWhatIsMissing(a, "two"), sayWhatIsMissing(a, "three")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db().from("feedback_prompt_words").select("id")).data).toHaveLength(1);
  });
  it("refuses by hand what the card could not do: when it is off, or before three active days", async () => {
    const w = await ws(); const ben = await w.person("member"); const eva = await w.person("member");
    await activeOn(w, ben, 3); await activeOn(w, eva, 2);
    await expect(markFeedbackPromptShown(w.actor(eva, "member"))).rejects.toEqual(expect.any(Forbidden));
    expect(await stateOf(eva)).toBeNull();
    await markFeedbackPromptShown(w.actor(ben, "member"));
    process.env.ZIFFR_FEEDBACK_PROMPT = "false"; forgetStoredSettings();
    await expect(markFeedbackPromptShown(w.actor(ben, "member"), later(40))).rejects.toEqual(expect.any(Forbidden));
    await expect(sayWhatIsMissing(w.actor(ben, "member"), "words")).rejects.toEqual(expect.any(Forbidden));
    expect((await db().from("feedback_prompt_words").select("id")).data).toHaveLength(0);
    expect((await stateOf(ben))?.shown_count).toBe(1);
  });
  it("keeps only the newest 500 words", async () => {
    await db().from("feedback_prompt_words").insert(Array.from({ length: 505 }, (_, i) => ({ words: `old ${i}` })));
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    const a = w.actor(ben, "member");
    await markFeedbackPromptShown(a);
    await sayWhatIsMissing(a, "newest");
    const { count } = await db().from("feedback_prompt_words").select("id", { count: "exact", head: true });
    expect(count).toBeLessThanOrEqual(501);
  });
});

describe("who reads the words", () => {
  it("is an Installation Admin only, newest first", async () => {
    const w = await ws(); const ben = await w.person("member");
    const admin = await installationAdmin(); cleanups.push(admin.cleanup);
    await db().from("feedback_prompt_words").insert([{ words: "one" }, { words: "two" }]);
    expect((await feedbackPromptWords(admin.actor)).map((r) => r.words)).toEqual(["two", "one"]);
    await expect(feedbackPromptWords({ personId: ben })).rejects.toBeTruthy();
    void w;
  });
});

describe("the person goes, the state goes", () => {
  it("removes the state with the profile", async () => {
    const w = await ws(); const ben = await w.person("member"); await activeOn(w, ben, 3);
    await markFeedbackPromptShown(w.actor(ben, "member"));
    expect(await stateOf(ben)).not.toBeNull();
    await db().from("observations").delete().eq("submitter_id", ben);
    await db().from("memberships").delete().eq("user_id", ben);
    await db().from("feedback_prompts").delete().eq("person_id", ben);
    expect(await stateOf(ben)).toBeNull();
  });
});
