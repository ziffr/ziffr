// First Steps' first value, who provides it and the closing screen against the real database and the local Mailpit (spec
// 0067, ticket 4; GLOSSARY: First Steps, Value, Submitter, Contact, Invitation, Trial Workspace): a trial before and
// after its Owner's own value; typing sends nothing and asking sends one; a colleague in a trial and in an ordinary
// Workspace; what became of a reply, only of one's own; and who may not call any of it. Nothing leaves this machine.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { optOutOfEmail } from "./email-opt-out";
import { firstStepsState } from "./first-steps";
import { chooseProviders, firstStepsDone, firstStepsSender } from "./first-steps-providers";
import { allowFirstStepsEmail, askFirstStepsByEmail, firstStepsProgress, firstStepsValue, pickFirstStepsMetric, sendFirstStepsValue } from "./first-steps-value";
import { acceptInvitation, inviteByEmail } from "./invitations";
import { addSubmitters } from "./metrics";
import { addContact, DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_JOB_SECRET: "s".repeat(40) };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

const made: Awaited<ReturnType<typeof workspace>>[] = [];
const strangers: string[] = [];
afterEach(async () => {
  for (const w of made.splice(0)) {
    // Contacts First Steps added are people the fixture does not know.
    const { data: contacts } = await db().from("contacts").select("person_id").eq("workspace_id", w.id);
    await db().from("deliveries").delete().eq("workspace_id", w.id);
    await w.cleanup();
    if (contacts?.length) await db().from("profiles").delete().in("id", contacts.map((c) => c.person_id as string));
  }
  if (strangers.length) await db().from("profiles").delete().in("id", strangers.splice(0));
});

const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;

/** A Workspace First Steps made, with one Metric of its Owner that nobody submits yet. */
async function fresh(over: { trial?: boolean; metric?: Record<string, unknown> } = {}) {
  const w = await workspace("Nord Co");
  made.push(w);
  const email = address("owner");
  const owner = await w.person("owner", { email });
  const o = w.actor(owner, "owner");
  const m = await w.metric(owner, { name: "Signups", ...over.metric });
  const { error } = await db().from("setup_guides").insert({ workspace_id: w.id, first_steps_at: new Date(Date.now() - 1000).toISOString(), started_at: new Date(Date.now() - 1000).toISOString() });
  if (error) throw error;
  if (over.trial) await w.trial("2099-01-01");
  return { w, o, owner, m, email };
}

const deliveries = async (ws: string) => (await db().from("deliveries").select("recipient_id, kind, connector").eq("workspace_id", ws)).data!;
const submitters = async (metricId: number) => (await db().from("tokens").select("submitter_id").eq("metric_id", metricId).is("stands_in_for", null)).data!.map((t) => t.submitter_id as string).sort();
const contacts = async (ws: string) => (await db().from("contacts").select("person_id").eq("workspace_id", ws)).data!.map((c) => c.person_id as string);
const invitations = async (ws: string) => (await db().from("invitations").select("email, role, contact_person_id, revoked_at, accepted_at, email_sends").eq("workspace_id", ws).order("id")).data!;
const chosenAt = async (ws: string) => (await db().from("setup_guides").select("providers_chosen_at").eq("workspace_id", ws).single()).data!.providers_chosen_at as string | null;
const workflowOf = async (metricId: number) => {
  const { data } = await db().from("metrics").select("workflow_id").eq("id", metricId).single();
  if (!data!.workflow_id) return null;
  return (await db().from("workflows").select("id, name").eq("id", data!.workflow_id).single()).data!;
};

describe("a trial, before and after the Owner's own value", () => {
  it("keeps a colleague locked until then, also after a value from a Feed or an Import", async () => {
    const { w, o, owner, m } = await fresh({ trial: true });
    const feed = await w.contact({ email: address("feed") });
    await db().from("observations").insert([
      { workspace_id: w.id, metric_id: m.id, period_start: "2026-01-01", value: 1, submitter_id: feed, source: "api" },
      { workspace_id: w.id, metric_id: m.id, period_start: "2026-02-01", value: 2, submitter_id: owner, source: "api", imported: true },
    ]);
    expect(await firstStepsSender(o)).toMatchObject({ locked: true, trial: true });
    expect((await firstStepsValue(o))!.invitesWait).toBe(true);
    await expect(chooseProviders(o, { choice: "colleague", email: address("sam") })).rejects.toThrow(/first value first/);
    await expect(inviteByEmail(o, { email: address("sam"), role: "guest" })).rejects.toThrow();
    expect(await contacts(w.id)).toEqual([feed]);
    expect(await invitations(w.id)).toEqual([]);
    expect(await chosenAt(w.id)).toBeNull();
    expect(await firstStepsDone(o)).toMatchObject({ open: true, invitesLocked: true, asked: "Nobody yet", value: null });
  });

  it("takes a typed value without any message, then opens the colleague: one Guest invitation tied to a Contact", async () => {
    const { w, o, owner, m } = await fresh({ trial: true });
    expect(await sendFirstStepsValue(o, "42")).toMatchObject({ ok: true });
    expect(await deliveries(w.id)).toEqual([]);
    expect(await submitters(m.id)).toEqual([owner]);
    expect(await firstStepsProgress(o)).toMatchObject({ value: { metric: "Signups", value: "42", byReply: false, waitsApproval: false }, canInvite: true, reply: null });
    expect((await firstStepsState(o))!.resume).toBe("sender");
    expect((await firstStepsSender(o)).locked).toBe(false);

    const email = address("sam");
    const r = await chooseProviders(o, { choice: "colleague", email: `  ${email.toUpperCase()} ` });
    expect(r).toMatchObject({ choice: "colleague", link: null });
    expect(r.lines.join(" ")).toMatch(/invited to join as a Guest. Ziffr asks them once they accept\./);
    const [contact] = await contacts(w.id);
    expect(await invitations(w.id)).toMatchObject([{ email, role: "guest", contact_person_id: contact, revoked_at: null }]);
    // The colleague takes the Owner's place, and nobody was asked for a value.
    expect(await submitters(m.id)).toEqual([contact]);
    expect(await deliveries(w.id)).toEqual([]);
    expect(await workflowOf(m.id)).toMatchObject({ name: "Ask on the 1st of the month" });
    expect((await firstStepsState(o))!.resume).toBe("finished");
    expect(await firstStepsDone(o)).toMatchObject({ open: false, invitesLocked: false, asked: `${email.split("@")[0]} (once they accept)` });

    // Choosing the same colleague again changes nothing.
    await chooseProviders(o, { choice: "colleague", email });
    expect(await contacts(w.id)).toEqual([contact]);
    expect(await invitations(w.id)).toHaveLength(1);

    // Accepting moves the Contact's Tokens to the person.
    const joiner = `t-${randomUUID()}`;
    strangers.push(joiner);
    await db().from("profiles").insert({ id: joiner, name: "Sam Joined", role: "", color: "#000", email });
    const { data: token } = await db().from("invitations").select("token").eq("workspace_id", w.id).single();
    await acceptInvitation({ personId: joiner, verifiedEmail: email }, token!.token as string);
    expect(await submitters(m.id)).toEqual([joiner]);
    expect((await db().from("memberships").select("role").eq("workspace_id", w.id).eq("user_id", joiner).single()).data).toEqual({ role: "guest" });
  });

  it("removes the new Contact again when the invitation is refused", async () => {
    const { w, o, owner, m } = await fresh({ trial: true });
    await sendFirstStepsValue(o, "1");
    // The address already has an open invitation that is not tied to a Contact: the database refuses a second.
    const email = address("taken");
    await inviteByEmail(o, { email, role: "member" });
    await expect(chooseProviders(o, { choice: "colleague", email })).rejects.toThrow();
    expect(await contacts(w.id)).toEqual([]);
    expect(await submitters(m.id)).toEqual([owner]);
    expect(await chosenAt(w.id)).toBeNull();
  });

  it("gives the Owner the link to send when the invitation is made but not emailed", async () => {
    const { w, o } = await fresh({ trial: true });
    await sendFirstStepsValue(o, "1");
    const url = process.env.ZIFFR_SMTP_URL;
    delete process.env.ZIFFR_SMTP_URL;
    try {
      const r = await chooseProviders(o, { choice: "colleague", email: address("sam") });
      const { data } = await db().from("invitations").select("token").eq("workspace_id", w.id).single();
      expect(r.link).toBe(`https://ziffr.example.test/invite/${data!.token as string}`);
      expect(r.lines).toEqual(["The invitation was not emailed; send the link yourself.", "Ziffr asks them once they accept."]);
      expect(await contacts(w.id)).toHaveLength(1);
    } finally { process.env.ZIFFR_SMTP_URL = url; }
  });

  it("takes a mistyped colleague back when another choice is made: invitation revoked, Contact removed", async () => {
    const { w, o, owner, m } = await fresh({ trial: true });
    await sendFirstStepsValue(o, "1");
    await chooseProviders(o, { choice: "colleague", email: address("typo") });
    const email = address("right");
    await chooseProviders(o, { choice: "colleague", email });
    const left = await contacts(w.id);
    expect(left).toHaveLength(1);
    expect(await submitters(m.id)).toEqual(left);
    expect((await invitations(w.id)).map((i) => Boolean(i.revoked_at))).toEqual([true, false]);
    await chooseProviders(o, { choice: "me" });
    expect(await contacts(w.id)).toEqual([]);
    expect(await submitters(m.id)).toEqual([owner]);
  });

  it("emails an address once, also after another colleague was chosen in between", async () => {
    const { w, o } = await fresh({ trial: true });
    await sendFirstStepsValue(o, "1");
    const sam = address("sam");
    expect((await chooseProviders(o, { choice: "colleague", email: sam })).link).toBeNull();
    await chooseProviders(o, { choice: "colleague", email: address("kim") });
    const again = await chooseProviders(o, { choice: "colleague", email: sam });
    const rows = await invitations(w.id);
    expect(rows.map((i) => i.email_sends)).toEqual([1, 1, 0]);
    expect(rows.map((i) => Boolean(i.revoked_at))).toEqual([true, true, false]);
    expect(again.link).toContain("/invite/");
    expect(again.lines[0]).toContain("sends no second one");
  });
});

describe("an ordinary Workspace", () => {
  it("takes back only the Contacts it added itself, not one the Owner added since", async () => {
    const { w, o, owner, m } = await fresh();
    await chooseProviders(o, { choice: "colleague", email: address("sam") });
    // Added by hand while the screen stayed open, and given the same number on purpose.
    const byHand = await addContact(o, { name: "Robin", email: address("robin") });
    await addSubmitters(o, m.id, [byHand]);
    await chooseProviders(o, { choice: "me" });
    expect(await contacts(w.id)).toEqual([byHand]);
    expect(await submitters(m.id)).toEqual([owner, byHand].sort());
  });

  it("adds a Contact in the Owner's place, invites nobody, asks nobody now, and keeps older Contacts", async () => {
    const { w, o, owner, m } = await fresh();
    const second = await w.metric(owner, { name: "Visits", period: "week" });
    await w.token(m.id, owner);
    const email = address("sam");
    const r = await chooseProviders(o, { choice: "colleague", email });
    expect(r.lines[0]).toContain("Ziffr asks");
    const [contact] = await contacts(w.id);
    expect(await submitters(m.id)).toEqual([contact]);
    expect(await submitters(second.id)).toEqual([contact]);
    expect(await invitations(w.id)).toEqual([]);
    expect(await deliveries(w.id)).toEqual([]);
    expect(await workflowOf(second.id)).toMatchObject({ name: "Ask every Monday" });
    // "Nobody for now": off the Workflows, the Owner can still type, and the typed colleague is taken back.
    await chooseProviders(o, { choice: "nobody" });
    expect(await workflowOf(m.id)).toBeNull();
    expect(await submitters(m.id)).toEqual([owner]);
    expect(await contacts(w.id)).toEqual([]);
    expect((await firstStepsState(o))!.resume).toBe("done");
    expect(await firstStepsDone(o)).toMatchObject({ open: true, invitesLocked: false, asked: "Nobody for now" });
    expect(await deliveries(w.id)).toEqual([]);
  });

  it("reuses one Workflow per period, uses a Member as they are, and takes the Owner's own address as I will", async () => {
    const { w, o, owner, m, email } = await fresh();
    const second = await w.metric(owner, { name: "Visits" });
    expect(await chooseProviders(o, { choice: "colleague", email })).toMatchObject({ choice: "me", lines: [] });
    expect((await workflowOf(m.id))!.id).toBe((await workflowOf(second.id))!.id);
    expect(await submitters(m.id)).toEqual([owner]);
    const benAt = address("ben");
    const ben = await w.person("member", { email: benAt });
    await chooseProviders(o, { choice: "colleague", email: benAt });
    expect(await submitters(m.id)).toEqual([ben]);
    expect(await contacts(w.id)).toEqual([]);
    expect(await invitations(w.id)).toEqual([]);
    expect((await db().from("workflows").select("id").eq("workspace_id", w.id)).data).toHaveLength(1);
  });

  it("leaves the Owner out again after they type a value for a number a colleague provides", async () => {
    const { w, o, m } = await fresh();
    await chooseProviders(o, { choice: "colleague", email: address("sam") });
    await sendFirstStepsValue(o, "7");
    expect(await submitters(m.id)).toEqual(await contacts(w.id));
    expect((await firstStepsState(o))!.resume).toBe("finished");
  });

  it("refuses a choice or an address it does not know", async () => {
    const { o } = await fresh();
    for (const bad of [null, {}, { choice: "boss" }, { choice: "colleague" }, { choice: "colleague", email: "nobody" }, { choice: "colleague", email: `${"a".repeat(260)}@example.test` }]) {
      await expect(chooseProviders(o, bad)).rejects.toThrow();
    }
  });
});

describe("Ask me by email", () => {
  it("sends exactly one request to the person, and holds the ten minutes", async () => {
    const { w, o, owner, m } = await fresh({ trial: true });
    expect((await firstStepsValue(o))!.email).toMatchObject({ state: "offered", reply: false });
    await askFirstStepsByEmail(o);
    expect(await deliveries(w.id)).toEqual([{ recipient_id: owner, kind: "prompt", connector: "email" }]);
    expect(await submitters(m.id)).toEqual([owner]);
    const view = (await firstStepsValue(o))!;
    expect(view.request!.words).toContain("What’s the number for Signups");
    expect(view.cooldown).toContain("You asked a moment ago");
    await expect(askFirstStepsByEmail(o)).rejects.toThrow(/a moment ago/);
    expect(await deliveries(w.id)).toHaveLength(1);
  });

  it("stops at the daily cap of a trial", async () => {
    const { w, o, m, owner } = await fresh({ trial: true });
    for (let i = 0; i < 5; i++) {
      await askFirstStepsByEmail(o);
      await db().from("tokens").delete().eq("metric_id", m.id).eq("submitter_id", owner);
      await db().from("ask_now_claims").delete().eq("metric_id", m.id);
    }
    await expect(askFirstStepsByEmail(o)).rejects.toThrow(/5 times today/);
    expect((await deliveries(w.id)).length).toBe(5);
  });

  it("sends nothing to someone who stopped these emails, until they switch them on again themself", async () => {
    const { w, o } = await fresh();
    await optOutOfEmail(o);
    expect((await firstStepsValue(o))!.email.state).toBe("stopped");
    await expect(askFirstStepsByEmail(o)).rejects.toThrow(/stopped requests for numbers by email/);
    expect((await deliveries(w.id)).filter((d) => d.kind === "prompt")).toEqual([]);
    await allowFirstStepsEmail(o);
    await askFirstStepsByEmail(o);
    expect((await deliveries(w.id)).filter((d) => d.kind === "prompt")).toHaveLength(1);
  });

  it("is not offered where email is not really sent", async () => {
    const { w, o } = await fresh();
    const url = process.env.ZIFFR_SMTP_URL;
    delete process.env.ZIFFR_SMTP_URL;
    try {
      expect((await firstStepsValue(o))!.email.state).toBe("off");
      await expect(askFirstStepsByEmail(o)).rejects.toThrow(/cannot ask you/);
      expect(await deliveries(w.id)).toEqual([]);
    } finally { process.env.ZIFFR_SMTP_URL = url; }
  });
});

describe("what became of a reply", () => {
  it("is told in fixed words, only for the person's own request and only since they were last asked", async () => {
    const { w, o, m, email } = await fresh();
    await askFirstStepsByEmail(o);
    const mine = (await db().from("deliveries").select("id").eq("workspace_id", w.id).single()).data!.id as number;
    const ben = await w.person("member", { email: address("ben") });
    const { data: prompt } = await db().from("prompts").insert({ metric_id: m.id, submitter_id: ben, source: "email", text: "?", period_start: "2027-01-01", workspace_id: w.id }).select("id").single();
    const { data: theirs } = await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: ben, kind: "prompt", subject: "s", body: "b", prompt_id: prompt!.id, mail_state: "sent" }).select("id").single();
    const came = (delivery: number, outcome: string, at = new Date()) => db().from("inbound_emails").insert({ delivery_id: delivery, workspace_id: w.id, outcome, received_at: at.toISOString() });
    await came(theirs!.id as number, "wrong_sender");
    await came(mine, "refused", new Date(Date.now() - 86_400_000));
    expect((await firstStepsProgress(o)).reply).toBeNull();
    for (const [outcome, words] of [
      ["refused", "Your reply was not recorded. Ziffr emailed you why."],
      ["expired", "That request is too old. Ask again."],
      ["wrong_sender", `A reply came from another address, so it was not counted. Reply from ${email}.`],
    ]) {
      await came(mine, outcome);
      expect((await firstStepsProgress(o)).reply).toBe(words);
    }
    // A held reply is mentioned only while its link still waits.
    await came(mine, "held");
    expect((await firstStepsProgress(o)).reply).toBeNull();
    const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
    const held = await db().from("held_replies").insert({ workspace_id: w.id, delivery_id: mine, token_hash: hash(), address_hash: hash(), kind: "value", sealed_text: "x", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(held.error).toBeNull();
    expect((await firstStepsProgress(o)).reply).toBe("Check your inbox for a link that confirms your reply.");
  });

  it("shows a value by reply as arrived, also for the Metric asked before another was chosen", async () => {
    const { w, o, owner, m } = await fresh();
    const other = await w.metric(owner, { name: "Visits" });
    await pickFirstStepsMetric(o, other.id);
    expect((await firstStepsValue(o))!.metric.name).toBe("Visits");
    await db().from("observations").insert({ workspace_id: w.id, metric_id: m.id, period_start: "2027-01-01", value: 9, submitter_id: owner, source: "mail" });
    expect(await firstStepsProgress(o)).toMatchObject({ value: { metric: "Signups", value: "9", byReply: true }, canInvite: false });
  });

  it("says a value waits for Approval, and counts it", async () => {
    const { w, o, owner, m } = await fresh();
    await db().from("observations").insert({ workspace_id: w.id, metric_id: m.id, period_start: "2027-01-01", value: 9, submitter_id: owner, source: "web_form" });
    await db().from("period_states").insert({ workspace_id: w.id, metric_id: m.id, period_start: "2027-01-01", state: "approval" });
    expect((await firstStepsProgress(o)).value).toMatchObject({ waitsApproval: true });
    expect((await firstStepsDone(o)).open).toBe(false);
  });
});

describe("who may not", () => {
  const all = (a: Actor) => [
    firstStepsValue(a), firstStepsProgress(a), askFirstStepsByEmail(a), allowFirstStepsEmail(a), pickFirstStepsMetric(a, 1), sendFirstStepsValue(a, "1"),
    firstStepsSender(a), chooseProviders(a, { choice: "me" }), firstStepsDone(a),
  ];
  const refused = async (a: Actor) => {
    for (const r of await Promise.allSettled(all(a))) expect(r.status === "rejected" && r.reason instanceof Forbidden).toBe(true);
  };

  it("refuses an Admin, a Member, a Guest, a claimed Owner, a key and the demo, and changes nothing", async () => {
    const { w, o, m } = await fresh();
    for (const role of ["admin", "member", "guest"] as const) await refused(w.actor(await w.person(role), role));
    const member = await w.person("member");
    await refused(w.actor(member, "owner"));
    await refused({ ...o, key: { id: 1, scopes: [] } } as unknown as Actor);
    await refused({ ...o, workspaceId: DEMO_WORKSPACE_ID });
    expect(await submitters(m.id)).toEqual([]);
    expect(await deliveries(w.id)).toEqual([]);
    expect(await chosenAt(w.id)).toBeNull();
  });

  it("refuses a Workspace First Steps did not make, and an ended trial", async () => {
    const other = await fresh();
    await db().from("setup_guides").update({ first_steps_at: null }).eq("workspace_id", other.w.id);
    await refused(other.o);
    const ended = await fresh();
    await ended.w.trial("2020-01-01");
    await refused(ended.o);
  });

  it("picks only among the Owner's own Metrics", async () => {
    const { w, o } = await fresh();
    const ben = await w.person("member");
    const theirs = await w.metric(ben, { name: "Ben's" });
    const elsewhere = await fresh();
    for (const id of [theirs.id, elsewhere.m.id, -1, "1"]) await expect(pickFirstStepsMetric(o, id)).rejects.toThrow();
  });
});
