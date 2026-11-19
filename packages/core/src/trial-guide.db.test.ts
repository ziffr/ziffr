// The Trial Guide through the core, against the real database (ticket 193): only the Owner of a running Trial
// Workspace has one, it keeps the step reached and the ways picked, it lets only real ways be picked, and asking
// sends the Test Metric's Prompt by them and shows the value once it is recorded.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { askTrialGuide, dailyWay, finishTrialGuide, saveTrialGuide, trialGuide, trialGuidePending, trialGuideValue } from "./trial-guide";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
afterEach(async () => {
  for (const k of ["ZIFFR_TRIAL_DAYS", ...Object.keys(MAIL)]) delete process.env[k];
  for (const id of made.workspaces.splice(0)) {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("deliveries").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
  }
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

async function newTrial(): Promise<Actor> {
  process.env.ZIFFR_TRIAL_DAYS = "7";
  const owner = `t-${randomUUID()}`;
  made.people.push(owner);
  await db().from("profiles").insert({ id: owner, name: "Trial owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
  const workspaceId = await createWorkspace(owner, "My trial");
  made.workspaces.push(workspaceId);
  return { personId: owner, workspaceId, role: "owner" };
}

describe("the Trial Guide", () => {
  it("starts at welcome with the Test Metric, without the form link, and keeps the step and ways", async () => {
    const owner = await newTrial();
    const g = (await trialGuide(owner))!;
    expect(g).toMatchObject({ step: "welcome", ways: [], testMetric: { name: "Cups of coffee", unit: "cups" } });
    expect(g).not.toHaveProperty("formCode");
    await saveTrialGuide(owner, "connect", ["web-form"]);
    expect(await trialGuide(owner)).toMatchObject({ step: "connect", ways: ["web-form"] });
    // Moving on without ways keeps the ones picked.
    await saveTrialGuide(owner, "where");
    expect(await trialGuide(owner)).toMatchObject({ step: "where", ways: ["web-form"] });
  });

  it("lets only real ways be picked, and makes the first messenger picked the Owner's own for Prompts", async () => {
    const owner = await newTrial();
    // No mail server and no Telegram bot here: both are simulated.
    await expect(saveTrialGuide(owner, "connect", ["email"])).rejects.toThrow(/really works/);
    await expect(saveTrialGuide(owner, "connect", ["telegram"])).rejects.toThrow(/really works/);
    await expect(saveTrialGuide(owner, "connect", ["whatsapp" as never])).rejects.toBeInstanceOf(Forbidden);
    await expect(saveTrialGuide(owner, "nowhere" as never)).rejects.toBeInstanceOf(Forbidden);
    Object.assign(process.env, MAIL);
    await saveTrialGuide(owner, "connect", ["web-form", "email"]);
    expect((await trialGuide(owner))!).toMatchObject({ ways: ["email", "web-form"], daily: "email" });
    const { data: pref } = await db().from("delivery_preferences").select("connector").eq("workspace_id", owner.workspaceId).eq("user_id", owner.personId).eq("kind", "reminder");
    expect(pref).toEqual([{ connector: "email" }]);
  });

  it("asks daily by one way: the first picked of Telegram, Slack and email, else email", () => {
    expect(dailyWay(["email", "telegram", "slack"])).toBe("telegram");
    expect(dailyWay(["email", "slack"])).toBe("slack");
    expect(dailyWay(["web-form"])).toBe("email");
    expect(dailyWay([])).toBe("email");
  });

  it("leads home and Try it to the guide until it is finished or skipped", async () => {
    const owner = await newTrial();
    expect(await trialGuidePending(owner)).toBe(true);
    expect(await trialGuidePending({ ...owner, role: "admin" })).toBe(false);
    await saveTrialGuide(owner, "connect");
    expect(await trialGuidePending(owner)).toBe(true);
    // Skip the guide.
    await finishTrialGuide(owner);
    expect(await trialGuidePending(owner)).toBe(false);
    // Reopened from the bar it still works, and going back does not make it pending again.
    await saveTrialGuide(owner, "where");
    expect(await trialGuidePending(owner)).toBe(false);

    const other = await newTrial();
    await saveTrialGuide(other, "done");
    expect(await trialGuidePending(other)).toBe(false);
    const { data } = await db().from("workspaces").select("trial_guide_finished_at").eq("id", other.workspaceId).single();
    expect(data!.trial_guide_finished_at).not.toBeNull();
  });

  it("is the Owner's alone, and only in a trial", async () => {
    const owner = await newTrial();
    const other: Actor = { ...owner, personId: `t-${randomUUID()}`, role: "admin" };
    expect(await trialGuide(other)).toBeNull();
    await expect(saveTrialGuide(other, "done")).rejects.toBeInstanceOf(Forbidden);
    await expect(finishTrialGuide(other)).rejects.toBeInstanceOf(Forbidden);
    await expect(trialGuideValue(other)).rejects.toBeInstanceOf(Forbidden);
    await expect(askTrialGuide(other)).rejects.toBeInstanceOf(Forbidden);
    // Once the trial has ended, nobody has a guide.
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", owner.workspaceId);
    expect(await trialGuide(owner)).toBeNull();
  });

  it("asks for the Test Metric by the ways picked and then shows its value", async () => {
    const owner = await newTrial();
    Object.assign(process.env, MAIL);
    await saveTrialGuide(owner, "ask", ["web-form"]);
    // Only the form link picked: the Prompt carrying it goes by email.
    const sent = await askTrialGuide(owner);
    expect(sent.results.map((s) => s.connector)).toEqual(["email"]);
    // The Owner's own form link comes with asking, and only then.
    const { data: token } = await db().from("tokens").select("code, submitter_id").eq("metric_id", (await trialGuide(owner))!.testMetric!.id).single();
    expect(token).toEqual({ code: sent.formCode, submitter_id: owner.personId });
    expect((await trialGuide(owner))!.step).toBe("ask");
    await expect(askTrialGuide(owner)).rejects.toThrow(/a moment ago/);
    expect(await trialGuideValue(owner)).toBeNull();
    const g = (await trialGuide(owner))!;
    const today = new Date().toISOString().slice(0, 10);
    await db().from("observations").insert({ metric_id: g.testMetric!.id, period_start: today, value: 3, submitter_id: owner.personId, source: "web_form", workspace_id: owner.workspaceId });
    expect(await trialGuideValue(owner)).toMatchObject({ value: 3, source: "web_form", period: today });
  });
});
