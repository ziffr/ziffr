// Automation Templates (docs/automations): the n8n workflows that bridge a Webhook to a task list. Two tests that need
// no n8n and no account: the shape of each file, and a run of its Code nodes against the Webhook fixtures, signed with a
// test secret. What the other system does is tried by hand and written in each template's README.
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./webhook-send";

type Param = Record<string, unknown>;
type N8nNode = { id: string; name: string; type: string; parameters: Param };
type Workflow = { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }> };

const dir = new URL("../../../docs/automations/", import.meta.url);
const load = (file: string) => JSON.parse(readFileSync(new URL(file, dir), "utf8")) as Workflow;
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, dir), "utf8"));
/** A fixture whose linked external tasks belong to `system` (the fixtures link microsoft-todo). */
const linkedTo = (name: string, system: string) => { const f = fixture(name); f.data.external_ids = f.data.external_ids.map((e: Param) => ({ ...e, system })); return f; };
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

const ALLOWED = new Set(["n8n-nodes-base.webhook", "n8n-nodes-base.respondToWebhook", "n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.set", "n8n-nodes-base.code", "n8n-nodes-base.switch", "n8n-nodes-base.if", "n8n-nodes-base.httpRequest", "n8n-nodes-base.stickyNote"]);
const TRIGGERS = new Set(["n8n-nodes-base.webhook", "n8n-nodes-base.scheduleTrigger"]);

describe("every template in docs/automations: shape", () => {
  it("has two files for each system", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) expect(f).toMatch(/^[a-z-]+-(from|to)-ziffr\.json$/);
  });
  for (const file of files) {
    const wf = load(file);
    it(`${file}: ids and names are unique, connections name real nodes, only allowed node types`, () => {
      expect(new Set(wf.nodes.map((n) => n.id)).size).toBe(wf.nodes.length);
      expect(new Set(wf.nodes.map((n) => n.name)).size).toBe(wf.nodes.length);
      const names = new Set(wf.nodes.map((n) => n.name));
      for (const [from, out] of Object.entries(wf.connections)) {
        expect(names.has(from)).toBe(true);
        for (const link of out.main.flat()) expect(names.has(link.node)).toBe(true);
      }
      for (const n of wf.nodes) expect(ALLOWED.has(n.type), `${n.name}: ${n.type}`).toBe(true);
    });
    it(`${file}: one trigger, and every other node is reached from it`, () => {
      const triggers = wf.nodes.filter((n) => TRIGGERS.has(n.type));
      expect(triggers).toHaveLength(1);
      const reached = new Set([triggers[0].name]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const [from, out] of Object.entries(wf.connections)) if (reached.has(from)) for (const l of out.main.flat()) if (!reached.has(l.node)) { reached.add(l.node); grew = true; }
      }
      for (const n of wf.nodes) if (n.type !== "n8n-nodes-base.stickyNote") expect(reached.has(n.name), n.name).toBe(true);
    });
    it(`${file}: holds no key, only placeholders, and a placeholder Webhook path`, () => {
      const text = JSON.stringify(wf);
      expect(text).not.toMatch(/whsec_[A-Za-z0-9]{8,}|zk_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9]|eyJ[A-Za-z0-9]{10,}/);
      const settings = wf.nodes.find((n) => n.name === "Settings")!;
      const values = ((settings.parameters.assignments as { assignments: { value: string }[] }).assignments).map((a) => a.value);
      for (const v of values) expect(v).toMatch(/^(https:\/\/)?REPLACE-WITH-/);
      const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
      if (hook) {
        expect(hook.parameters.path).toMatch(/REPLACE/);
        expect((hook.parameters.options as Param).rawBody).toBe(true);
        expect(hook.parameters.responseMode).toBe("responseNode");
      }
    });
    it(`${file}: every Code node is valid JavaScript`, () => {
      for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) expect(() => new vm.Script(`(async function(){${n.parameters.jsCode}})`), n.name).not.toThrow();
    });
  }
});

// ---- the fixture run ----

const SECRET = "whsec_TESTTESTTESTTESTTESTTESTTESTTESTTESTTEST0";
const OWN_WEBHOOK = "2c9e5b1a-6d3f-4f7e-b8a1-0e5c9d7a3b42";
const T0 = 1763630102;
const NOW = (T0 + 10) * 1000;

class FakeDate extends Date {
  constructor(...a: unknown[]) { if (a.length) super(...(a as [string])); else super(NOW); }
  static now() { return NOW; }
}

/** Runs one Code node the way n8n does: as an async function with the helpers n8n gives it. */
async function runNode(wf: Workflow, name: string, o: { items: { json: Param }[]; nodes?: Record<string, { json: Param }[]>; state?: Param; raw?: string }) {
  const code = (wf.nodes.find((n) => n.name === name)!.parameters.jsCode) as string;
  const nodes = o.nodes ?? {};
  const sandbox = {
    $input: { first: () => o.items[0], all: () => o.items },
    $: (n: string) => ({ first: () => nodes[n][0], all: () => nodes[n] }),
    $getWorkflowStaticData: () => o.state ?? {},
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require: (m: string) => { if (m !== "crypto") throw new Error(`module ${m}`); return require("node:crypto"); },
    Buffer, Date: FakeDate, JSON, Object, Math, Set, Number, String, RegExp, Array,
  };
  const fn = vm.runInNewContext(`(async function(){${code}})`, sandbox) as () => Promise<{ json: Param }[]>;
  return fn.call({ helpers: { getBinaryDataBuffer: async () => Buffer.from(o.raw ?? "") } });
}

type Spec = { prefix: string; system: string; createBody: Param; closeBody: Param; patchOpenBody: Param; list: Param; taskNotes: (ref: string, extra?: string) => string; task: (o: { id: string; notes: string; done: boolean }) => Param };

const ALL_SPECS: Spec[] = [
  {
    prefix: "microsoft-todo", system: "microsoft-todo",
    createBody: { title: "Send the October report to the board", body: { content: "Ziffr ref: ZIF-12\nhttps://ziffr.example.test/actions/12\nMetric: Monthly revenue\nAsked by: Sara Jones\n--- end of Ziffr text ---", contentType: "text" }, status: "notStarted", dueDateTime: { dateTime: "2026-11-27T00:00:00.0000000", timeZone: "UTC" } },
    closeBody: { status: "completed" },
    patchOpenBody: { title: "Send the October report to the board", dueDateTime: { dateTime: "2026-11-27T00:00:00.0000000", timeZone: "UTC" }, status: "notStarted" },
    list: {},
    taskNotes: (ref, extra = "") => `Ziffr ref: ${ref}\n--- end of Ziffr text ---\n${extra}`,
    task: ({ id, notes, done }) => ({ id, title: "t", status: done ? "completed" : "notStarted", body: { content: notes, contentType: "text" } }),
  },
  {
    prefix: "google-tasks", system: "google-tasks",
    createBody: { title: "Send the October report to the board", notes: "Ziffr ref: ZIF-12\nhttps://ziffr.example.test/actions/12\nMetric: Monthly revenue\nAsked by: Sara Jones\n--- end of Ziffr text ---", status: "needsAction", due: "2026-11-27T00:00:00.000Z" },
    closeBody: { status: "completed" },
    patchOpenBody: { title: "Send the October report to the board", due: "2026-11-27T00:00:00.000Z", status: "needsAction", completed: null },
    list: {},
    taskNotes: (ref, extra = "") => `Ziffr ref: ${ref}\n--- end of Ziffr text ---\n${extra}`,
    task: ({ id, notes, done }) => ({ id, title: "t", status: done ? "completed" : "needsAction", notes, webViewLink: `https://tasks.google.example.test/${id}` }),
  },
];
const SPECS = ALL_SPECS.filter((s) => files.includes(`${s.prefix}-from-ziffr.json`));

/** A message as Ziffr sends it: signed with the test secret at the signing example's time. */
function delivered(body: unknown, over: { secret?: string; timestamp?: number; extraBody?: string } = {}) {
  const raw = JSON.stringify(body) + (over.extraBody ?? "");
  const timestamp = over.timestamp ?? T0;
  const sig = signWebhookBody([over.secret ?? SECRET], timestamp, JSON.stringify(body));
  const evt = body as { id: string };
  return { raw, json: { headers: { "x-ziffr-timestamp": String(timestamp), "x-ziffr-signature": sig, "x-ziffr-delivery": evt.id }, body, secret: SECRET, webhookId: "someone-else", listId: "L1" } as Param };
}

for (const spec of SPECS) {
  describe(`${spec.prefix}: Ziffr to the list, fixture run`, () => {
    const wf = load(`${spec.prefix}-from-ziffr.json`);
    const verify = async (m: ReturnType<typeof delivered>, state: Param = {}, webhookId?: string) => {
      const json = webhookId ? { ...m.json, webhookId } : m.json;
      const [r] = await runNode(wf, "Verify and filter", { items: [{ json }], state, raw: m.raw });
      return r.json;
    };

    it("accepts a correct action.created and builds the task", async () => {
      const r = await verify(delivered(fixture("action-created")));
      expect(r).toMatchObject({ httpStatus: 200, action: "create", ref: "ZIF-12" });
      expect(r.createBody).toEqual(spec.createBody);
    });
    it("refuses a wrong signature, a changed body, an old timestamp and a missing header", async () => {
      expect(await verify(delivered(fixture("action-created"), { secret: "whsec_other" }))).toMatchObject({ httpStatus: 401, action: "none" });
      expect(await verify(delivered(fixture("action-created"), { extraBody: " " }))).toMatchObject({ httpStatus: 401 });
      expect(await verify(delivered(fixture("action-created"), { timestamp: T0 - 400 }))).toMatchObject({ httpStatus: 401 });
      const m = delivered(fixture("action-created"));
      delete (m.json.headers as Param)["x-ziffr-signature"];
      expect(await verify(m)).toMatchObject({ httpStatus: 401 });
    });
    it("takes a secret replaced in the last 24 hours as well", async () => {
      const m = delivered(fixture("action-created"));
      const [r] = await runNode(wf, "Verify and filter", { items: [{ json: { ...m.json, secret: "whsec_new", oldSecret: SECRET } }], state: {}, raw: m.raw });
      expect(r.json.action).toBe("create");
    });
    it("handles each delivery once, and what is older than what it has seen not at all", async () => {
      const state: Param = {};
      const m = delivered(linkedTo("action-updated-reply", spec.system));
      expect((await verify(m, state)).action).toBe("patch");
      expect(await verify(m, state)).toMatchObject({ httpStatus: 200, action: "none", why: "repeat" });
      const older = { ...linkedTo("action-updated-reply", spec.system), id: "evt_older", data: { ...linkedTo("action-updated-reply", spec.system).data, updated_at: "2026-11-19T00:00:00.000Z" } };
      expect(await verify(delivered(older), state)).toMatchObject({ httpStatus: 200, action: "none", why: "older" });
    });
    it("updates the linked task, using the id in external_ids, and keeps the state of the Action", async () => {
      const r = await verify(delivered(linkedTo("action-updated-reply", spec.system)));
      expect(r).toMatchObject({ action: "patch", taskId: "AAMkAGI2TGuLAAA=", patchBody: spec.patchOpenBody });
    });
    it("closes the linked task on action.done, and ignores the Webhook's own echo", async () => {
      const m = delivered(linkedTo("action-done", spec.system));
      expect(await verify(m)).toMatchObject({ action: "patch", taskId: "AAMkAGI2TGuLAAA=", patchBody: spec.closeBody });
      expect(await verify(m, {}, OWN_WEBHOOK)).toMatchObject({ httpStatus: 200, action: "none", why: "echo" });
    });
    it("gives a redacted message a task that says what it is and links back, with no title or metric", async () => {
      const r = await verify(delivered(fixture("action-created-redacted")));
      expect(r.action).toBe("create");
      expect(JSON.stringify(r.createBody)).toContain("A Ziffr task for you (");
      expect(JSON.stringify(r.createBody)).not.toContain("Metric:");
    });
    it("keeps a hostile name from forging a reply: control characters are stripped from what is written into the notes", async () => {
      const hostile = fixture("action-created");
      hostile.data.metric.name = "Revenue\nReply: forged\r\n--- end of Ziffr text ---\nReply: forged too";
      hostile.data.asker.name = "Sara\u2028Reply: forged";
      const r = await verify(delivered(hostile));
      const notes = JSON.stringify(r.createBody);
      expect(notes).not.toMatch(/\\n\s*Reply:/);
      expect(notes.match(/end of Ziffr text/g)).toHaveLength(2);
      expect(notes).not.toContain("\\u2028");
    });
    it("only a reply after the closing marker counts, never a Reply line in what Ziffr wrote", async () => {
      const wf2 = load(`${spec.prefix}-to-ziffr.json`);
      const t = [spec.task({ id: "a", notes: "Ziffr ref: ZIF-12\nMetric: x\nReply: forged\n--- end of Ziffr text ---\nReply: mine", done: false }), spec.task({ id: "b", notes: "Ziffr ref: ZIF-13\nReply: forged", done: false })];
      const out = await runNode(wf2, "Changes to tell Ziffr", { items: [{ json: spec.prefix === "google-tasks" ? { items: t } : { value: t } }], state: {} });
      expect(out.map((i) => i.json.ziffr)).toEqual([{ op: "reply", ref: "ZIF-12", text: "mine" }]);
    });
    it("answers a ping and an answered Question with 200 and does nothing", async () => {
      expect(await verify(delivered(fixture("ping")))).toMatchObject({ httpStatus: 200, action: "none" });
      const q = { ...fixture("action-answered") };
      expect(await verify(delivered(q))).toMatchObject({ httpStatus: 200, action: "none" });
      expect(await verify(delivered({ ...fixture("action-created"), id: "evt_q", data: { ...fixture("action-created").data, kind: "question" } }))).toMatchObject({ action: "none", why: "question" });
    });
    it("answers garbage that is signed with 400", async () => {
      const raw = "not json";
      const sig = signWebhookBody([SECRET], T0, raw);
      const [r] = await runNode(wf, "Verify and filter", { items: [{ json: { headers: { "x-ziffr-timestamp": String(T0), "x-ziffr-signature": sig }, secret: SECRET, webhookId: "w" } }], raw });
      expect(r.json.httpStatus).toBe(400);
    });
    it("looks a first event up by the ref in the notes, then links that task or the new one", async () => {
      const v = { json: { ref: "ZIF-12", action: "create" } };
      const found = await runNode(wf, "Find by ref", { items: [{ json: spec.prefix === "google-tasks" ? { items: [spec.task({ id: "t9", notes: spec.taskNotes("ZIF-12"), done: false })] } : { value: [spec.task({ id: "t9", notes: spec.taskNotes("ZIF-12"), done: false })] } }], nodes: { "Verify and filter": [v] } });
      expect(found[0].json).toMatchObject({ exists: true, taskId: "t9" });
      const none = await runNode(wf, "Find by ref", { items: [{ json: spec.prefix === "google-tasks" ? { items: [spec.task({ id: "t1", notes: spec.taskNotes("ZIF-120"), done: false })] } : { value: [spec.task({ id: "t1", notes: spec.taskNotes("ZIF-120"), done: false })] } }], nodes: { "Verify and filter": [v] } });
      expect(none[0].json.exists).toBe(false);
      const linkExisting = await runNode(wf, "Prepare link", { items: [found[0]], nodes: { "Verify and filter": [v] } });
      expect(linkExisting[0].json.ziffr).toMatchObject({ op: "link", ref: "ZIF-12", system: spec.system, external_id: "t9" });
      const linkNew = await runNode(wf, "Prepare link", { items: [{ json: spec.task({ id: "n1", notes: "", done: false }) }], nodes: { "Verify and filter": [v] } });
      expect(linkNew[0].json.ziffr).toMatchObject({ op: "link", ref: "ZIF-12", system: spec.system, external_id: "n1" });
    });
    it("signs a request that Ziffr's own verifier accepts", async () => {
      const [s] = await runNode(wf, "Sign request", { items: [{ json: { ziffr: { op: "link", ref: "ZIF-12", system: spec.system, external_id: "x", url: "https://example.test/x" } } }], nodes: { Settings: [{ json: { secret: SECRET, webhookId: "wh 1", ziffrUrl: "https://ziffr.example.test/" } }] } });
      expect(s.json.url).toBe("https://ziffr.example.test/api/webhooks/wh%201/in");
      expect(JSON.parse(s.json.body as string)).toEqual({ op: "link", ref: "ZIF-12", system: spec.system, external_id: "x", url: "https://example.test/x" });
      expect(verifyWebhookSignature([SECRET], s.json.timestamp as string, s.json.body as string, s.json.signature as string, NOW / 1000)).toBe(true);
    });
  });

  describe(`${spec.prefix}: the list to Ziffr, fixture run`, () => {
    const wf = load(`${spec.prefix}-to-ziffr.json`);
    const list = (tasks: Param[]) => (spec.prefix === "google-tasks" ? { items: tasks } : { value: tasks });
    const changes = async (tasks: Param[], state: Param) => (await runNode(wf, "Changes to tell Ziffr", { items: [{ json: list(tasks) }], state })).map((i) => i.json.ziffr);

    it("tells Ziffr a ticked task is done once, an un-ticked one is reopened, and a Reply line comes through", async () => {
      const state: Param = {};
      const t = (done: boolean, extra = "") => [spec.task({ id: "a", notes: spec.taskNotes("ZIF-12", extra), done }), spec.task({ id: "b", notes: "no ref here", done: true })];
      expect(await changes(t(false), state)).toEqual([]);
      expect(await changes(t(true), state)).toEqual([{ op: "done", ref: "ZIF-12" }]);
      // Ziffr took it: remembered, so it is not sent again.
      const sent = [{ json: { ziffr: { op: "done", ref: "ZIF-12" }, op: "done", ref: "ZIF-12" } }];
      const answers = [{ json: { statusCode: 200 } }];
      await runNode(wf, "Remember what Ziffr took", { items: answers, nodes: { "Sign request": sent }, state });
      expect(await changes(t(true), state)).toEqual([]);
      expect(await changes(t(false), state)).toEqual([{ op: "reopen", ref: "ZIF-12" }]);
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([{ op: "reopen", ref: "ZIF-12" }, { op: "reply", ref: "ZIF-12", text: "Draft is ready" }]);
      await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 200 } }, { json: { statusCode: 404 } }], nodes: { "Sign request": [{ json: { op: "reopen", ref: "ZIF-12" } }, { json: { op: "reply", ref: "ZIF-12", text: "Draft is ready" } }] }, state });
      // The reopen was taken; the reply got a 404 and is tried again.
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([{ op: "reply", ref: "ZIF-12", text: "Draft is ready" }]);
      await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 409 } }], nodes: { "Sign request": [{ json: { op: "reply", ref: "ZIF-12", text: "Draft is ready" } }] }, state });
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([]);
    });
    it("forgets a ref that is gone from a list it saw whole, and sends at most 30 a run", async () => {
      const state: Param = { reported: { "ZIF-1": "done" } };
      await changes([], state);
      expect(state.reported).toEqual({});
      const many = Array.from({ length: 40 }, (_, i) => spec.task({ id: `t${i}`, notes: spec.taskNotes(`ZIF-${i + 1}`), done: true }));
      expect(await changes(many, {})).toHaveLength(30);
    });
    it("signs what it sends with the same scheme", async () => {
      const [s] = await runNode(wf, "Sign request", { items: [{ json: { ziffr: { op: "done", ref: "ZIF-12" } } }], nodes: { Settings: [{ json: { secret: SECRET, webhookId: "wh", ziffrUrl: "https://ziffr.example.test" } }] } });
      expect(verifyWebhookSignature([SECRET], s.json.timestamp as string, s.json.body as string, s.json.signature as string, NOW / 1000)).toBe(true);
      expect(s.json).toMatchObject({ op: "done", ref: "ZIF-12" });
    });
  });
}
