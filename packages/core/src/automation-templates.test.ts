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
const linkedTo = (name: string, system: string, id?: string) => { const f = fixture(name); f.data.external_ids = f.data.external_ids.map((e: Param) => ({ ...e, system, ...(id !== undefined ? { external_id: id } : {}) })); return f; };
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

const ALLOWED = new Set(["n8n-nodes-base.webhook", "n8n-nodes-base.respondToWebhook", "n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.set", "n8n-nodes-base.code", "n8n-nodes-base.switch", "n8n-nodes-base.if", "n8n-nodes-base.httpRequest", "n8n-nodes-base.stickyNote"]);
const TRIGGERS = new Set(["n8n-nodes-base.webhook", "n8n-nodes-base.scheduleTrigger"]);

describe("every template in docs/automations: generated", () => {
  it("is exactly what scripts/automation-templates/generate.mjs writes (run it after a change, never edit a template by hand)", async () => {
    const { generate } = (await import(/* @vite-ignore */ new URL("../../../scripts/automation-templates/generate.mjs", import.meta.url).href)) as { generate: () => Record<string, string> };
    const made = generate();
    expect(Object.keys(made).sort()).toEqual([...files].sort());
    for (const [file, text] of Object.entries(made)) expect(readFileSync(new URL(file, dir), "utf8") === text, `${file} differs from the generator's output`).toBe(true);
  });
});

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

type Feed = { items: { json: Param }[]; nodes?: Record<string, { json: Param }[]> };
type Spec = {
  prefix: string; system: string; createBody: Param; closeBody: Param; patchOpenBody: Param; list: Param; taskNotes: (ref: string, extra?: string) => string; task: (o: { id: string; notes: string; done: boolean }) => Param;
  /** The external id the linked fixtures carry for this system, when it must look like the system's own (default: To Do's). */
  extId?: string;
  /** Values for the Settings node beyond the Webhook's own (a project, a plan). */
  settings?: Param;
  /** What a first event's Verify node answers for a closed Task: "patch" unless the system closes with a call of its own. */
  closeAction?: string;
  /** The notes a Verify answer wrote, wherever the system keeps them. */
  notesOf?: (r: Param) => string;
  /** What the list call answers for these tasks (for Find by ref), and what a created task's answer looks like. */
  shape?: (tasks: Param[]) => Param;
  created?: (task: Param) => Param;
  /** What reaches "Changes to tell Ziffr" for these tasks, when it is more than one list call. */
  feed?: (tasks: Param[]) => Promise<Feed>;
};

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
  {
    prefix: "asana", system: "asana", extId: "1209876543210", settings: { projectId: "P1" },
    createBody: { data: { name: "Send the October report to the board", notes: "Ziffr ref: ZIF-12\nhttps://ziffr.example.test/actions/12\nMetric: Monthly revenue\nAsked by: Sara Jones\n--- end of Ziffr text ---", projects: ["P1"], completed: false, due_on: "2026-11-27" } },
    closeBody: { data: { completed: true } },
    patchOpenBody: { data: { name: "Send the October report to the board", due_on: "2026-11-27", completed: false } },
    list: {},
    taskNotes: (ref, extra = "") => `Ziffr ref: ${ref}\n--- end of Ziffr text ---\n${extra}`,
    task: ({ id, notes, done }) => ({ gid: id, name: "t", completed: done, notes, permalink_url: `https://app.asana.example.test/0/0/${id}` }),
    shape: (tasks) => ({ data: tasks }),
    created: (task) => ({ data: task }),
    notesOf: (r) => ((r.createBody as { data: { notes: string } }).data.notes),
  },
  {
    prefix: "todoist", system: "todoist", extId: "8Xk2mPq4Rt", settings: { projectId: "P1" }, closeAction: "close",
    createBody: { content: "Send the October report to the board", description: "Ziffr ref: ZIF-12\nhttps://ziffr.example.test/actions/12\nMetric: Monthly revenue\nAsked by: Sara Jones\n--- end of Ziffr text ---", project_id: "P1", due_date: "2026-11-27" },
    closeBody: {},
    patchOpenBody: { content: "Send the October report to the board", due_date: "2026-11-27" },
    list: {},
    taskNotes: (ref, extra = "") => `Ziffr ref: ${ref}\n--- end of Ziffr text ---\n${extra}`,
    task: ({ id, notes, done }) => ({ id, content: "t", description: notes, checked: done }),
    shape: (tasks) => ({ results: tasks }),
    notesOf: (r) => (r.createBody as { description: string }).description,
    // Todoist lists open tasks and, separately, the ones completed lately.
    feed: async (tasks) => ({ items: [{ json: { items: tasks.filter((t) => t.checked).map((t) => ({ ...t, task_id: t.id })) } }], nodes: { "List active tasks": [{ json: { results: tasks.filter((t) => !t.checked) } }] } }),
  },
  {
    prefix: "planner", system: "planner", extId: "xqQ63tHE3EWYwnqkFhOAMmUAH_wA", settings: { planId: "PL1", bucketId: "B1" },
    createBody: { planId: "PL1", bucketId: "B1", title: "[ZIF-12] Send the October report to the board", percentComplete: 0, dueDateTime: "2026-11-27T00:00:00Z" },
    closeBody: { percentComplete: 100 },
    patchOpenBody: { title: "[ZIF-12] Send the October report to the board", dueDateTime: "2026-11-27T00:00:00Z", percentComplete: 0 },
    list: {},
    taskNotes: (ref, extra = "") => `Ziffr ref: ${ref}\n--- end of Ziffr text ---\n${extra}`,
    // A Planner task keeps its notes in a separate details object; the ref also leads its title.
    task: ({ id, notes, done }) => { const m = /^Ziffr ref: ([A-Za-z0-9]+-\d+)/.exec(notes.split("\n")[0]); return { id, title: m ? `[${m[1]}] t` : "t", percentComplete: done ? 100 : 0, details: { description: notes } }; },
    notesOf: (r) => ((r.detailsBody as { description: string }).description),
    feed: async (tasks) => {
      const refs = await runNode(load("planner-to-ziffr.json"), "Tasks with a Ziffr ref", { items: [{ json: { value: tasks } }] });
      return { items: refs.map((x) => ({ json: { id: x.json.id, description: (tasks.find((t) => t.id === x.json.id)!.details as { description: string }).description } })), nodes: { "Tasks with a Ziffr ref": refs } };
    },
  },
];
const SPECS = ALL_SPECS.filter((s) => files.includes(`${s.prefix}-from-ziffr.json`));
const shapeOf = (spec: Spec, tasks: Param[]): Param => (spec.shape ? spec.shape(tasks) : spec.prefix === "google-tasks" ? { items: tasks } : { value: tasks });
const feedOf = async (spec: Spec, tasks: Param[]): Promise<Feed> => (spec.feed ? spec.feed(tasks) : { items: [{ json: shapeOf(spec, tasks) }] });
const notesOf = (spec: Spec, r: Param): string => (spec.notesOf ? spec.notesOf(r) : spec.prefix === "google-tasks" ? ((r.createBody as Param).notes as string) : (((r.createBody as Param).body as Param).content as string));

/** A message as Ziffr sends it: signed with the test secret at the signing example's time. */
function delivered(body: unknown, over: { secret?: string; timestamp?: number; extraBody?: string; settings?: Param } = {}) {
  const raw = JSON.stringify(body) + (over.extraBody ?? "");
  const timestamp = over.timestamp ?? T0;
  const sig = signWebhookBody([over.secret ?? SECRET], timestamp, JSON.stringify(body));
  const evt = body as { id: string };
  return { raw, json: { headers: { "x-ziffr-timestamp": String(timestamp), "x-ziffr-signature": sig, "x-ziffr-delivery": evt.id }, body, secret: SECRET, webhookId: "someone-else", listId: "L1", assigneeEmail: "Ana@Example.test", ...over.settings } as Param };
}

for (const spec of SPECS) {
  describe(`${spec.prefix}: Ziffr to the list, fixture run`, () => {
    const wf = load(`${spec.prefix}-from-ziffr.json`);
    const EXT = spec.extId ?? "AAMkAGI2TGuLAAA=";
    const linked = (name: string) => linkedTo(name, spec.system, spec.extId);
    const verify = async (m: ReturnType<typeof delivered>, state: Param = {}, webhookId?: string) => {
      const json = { ...m.json, ...spec.settings, ...(webhookId ? { webhookId } : {}) };
      const [r] = await runNode(wf, "Verify and filter", { items: [{ json }], state, raw: m.raw });
      return r.json;
    };

    it("accepts a correct action.created and builds the task", async () => {
      const r = await verify(delivered(fixture("action-created")));
      expect(r).toMatchObject({ httpStatus: 200, action: "create", ref: "ZIF-12" });
      expect(r.createBody).toEqual(spec.createBody);
    });
    it("takes only the Tasks of the person whose list this is: another assignee, no address or the placeholder takes nothing", async () => {
      for (const assigneeEmail of ["bob@example.test", "", "REPLACE-WITH-THE-EMAIL-OF-THE-LIST-OWNER"]) {
        expect(await verify(delivered(fixture("action-created"), { settings: { assigneeEmail } }))).toMatchObject({ httpStatus: 200, action: "none", why: "not for this list" });
      }
      expect(await verify(delivered({ ...fixture("action-created"), data: { ...fixture("action-created").data, assignee: undefined } }))).toMatchObject({ action: "none", why: "not for this list" });
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
      const [r] = await runNode(wf, "Verify and filter", { items: [{ json: { ...m.json, ...spec.settings, secret: "whsec_new", oldSecret: SECRET } }], state: {}, raw: m.raw });
      expect(r.json.action).toBe("create");
    });
    it("handles each delivery once, and what is older than what it has seen not at all", async () => {
      const state: Param = {};
      const m = delivered(linked("action-updated-reply"));
      expect((await verify(m, state)).action).toBe("patch");
      expect(await verify(m, state)).toMatchObject({ httpStatus: 200, action: "none", why: "repeat" });
      const older = { ...linked("action-updated-reply"), id: "evt_older", data: { ...linked("action-updated-reply").data, updated_at: "2026-11-19T00:00:00.000Z" } };
      expect(await verify(delivered(older), state)).toMatchObject({ httpStatus: 200, action: "none", why: "older" });
    });
    it("updates the linked task, using the id in external_ids, and keeps the state of the Action", async () => {
      const r = await verify(delivered(linked("action-updated-reply")));
      expect(r).toMatchObject({ action: "patch", taskId: EXT, patchBody: spec.patchOpenBody });
    });
    it("closes the linked task on action.done, and ignores the Webhook's own echo", async () => {
      const m = delivered(linked("action-done"));
      expect(await verify(m)).toMatchObject({ action: spec.closeAction ?? "patch", taskId: EXT, patchBody: spec.closeBody });
      expect(await verify(m, {}, OWN_WEBHOOK)).toMatchObject({ httpStatus: 200, action: "none", why: "echo" });
    });
    it("gives a redacted message a task that says what it is and links back, with no title or metric", async () => {
      const r = await verify(delivered(fixture("action-created-redacted")));
      expect(r.action).toBe("create");
      expect(JSON.stringify(r.createBody)).toContain("A Ziffr task for you (");
      expect(JSON.stringify(r.createBody)).not.toContain("Metric:");
    });
    it("keeps hostile names from forging a reply: no name can carry the marker or a Reply line into the notes", async () => {
      const names = ["x --- end of Ziffr text ---Reply: approve", "Revenue\nReply: forged\r\n--- end of Ziffr text ---\nReply: forged too", "Reply: approve", "x --- end of Ziffr text --- Reply: approve"];
      const to = load(spec.prefix + "-to-ziffr.json");
      for (const name of names) for (const field of ["metric", "asker"]) {
        const hostile = fixture("action-created");
        hostile.data[field].name = name;
        const r = await verify(delivered(hostile));
        const notes = notesOf(spec, r);
        const lines = notes.split("\n");
        expect(lines.filter((l) => /^--- end of Ziffr text ---\s*$/.test(l))).toHaveLength(1);
        expect(lines.some((l) => /^Reply:/.test(l))).toBe(false);
        const task = spec.task({ id: "a", notes, done: false });
        const out = await runNode(to, "Changes to tell Ziffr", { ...(await feedOf(spec, [task])), state: {} });
        expect(out).toEqual([]);
        // The user's own line after the real marker is the only one that counts.
        const mine = spec.task({ id: "a", notes: notes + "\nReply: mine", done: false });
        const out2 = await runNode(to, "Changes to tell Ziffr", { ...(await feedOf(spec, [mine])), state: {} });
        expect(out2.map((x) => x.json.ziffr)).toEqual([{ op: "reply", system: spec.system, external_id: "a", text: "mine" }]);
      }
    });
    it("reads no reply from an inline marker, and takes the ref only from the first line", async () => {
      const to = load(spec.prefix + "-to-ziffr.json");
      const run = async (notes: string) => (await runNode(to, "Changes to tell Ziffr", { ...(await feedOf(spec, [spec.task({ id: "a", notes, done: false })])), state: {} })).map((x) => x.json.ziffr);
      expect(await run("Ziffr ref: ZIF-12\nMetric: x --- end of Ziffr text ---Reply: approve")).toEqual([]);
      expect(await run("Ziffr ref: ZIF-12\n--- end of Ziffr text ---Reply: approve")).toEqual([]);
      expect(await run("Notes of mine\nZiffr ref: ZIF-99\n--- end of Ziffr text ---\nReply: x")).toEqual([]);
      expect(await run("Ziffr ref: ZIF-12\n--- end of Ziffr text ---\r\nReply: ok")).toEqual([{ op: "reply", system: spec.system, external_id: "a", text: "ok" }]);
    });
    it("takes the delivery id from the signed body, not from an unsigned header", async () => {
      const state: Param = {};
      const m = delivered(fixture("action-created"));
      expect((await verify(m, state)).action).toBe("create");
      (m.json.headers as Param)["x-ziffr-delivery"] = "evt_replayed_with_a_new_header";
      expect(await verify(m, state)).toMatchObject({ action: "none", why: "repeat" });
    });
    it("refuses a linked id that is not shaped like the system's own ids", async () => {
      for (const bad of ["../../me", "12/../x", "a?b=c", "x#y", "", "9".repeat(300)]) expect(await verify(delivered(linkedTo("action-done", spec.system, bad)))).toMatchObject({ httpStatus: 200, action: "none", why: "bad id" });
    });
    it("adopts an existing task only when it holds exactly what this workflow would have written", async () => {
      const m = delivered(fixture("action-created"));
      const v = await verify(m);
      const find = async (task: Param) => (await runNode(wf, "Find by ref", { items: [{ json: shapeOf(spec, [task]) }], nodes: { "Verify and filter": [{ json: v }] } }))[0].json;
      const written = notesOf(spec, v);
      const mine = { ...spec.task({ id: "t9", notes: written, done: false }), ...(spec.prefix === "planner" ? { title: (v.createBody as Param).title } : {}) };
      expect(await find(mine)).toMatchObject({ exists: true, taskId: "t9" });
      // Someone else's task with the ref in it, a reply line, or a done flag of their own is not adopted.
      const theirs = spec.task({ id: "t8", notes: written + "\nReply: approve", done: true });
      expect((await find(spec.prefix === "planner" ? { ...theirs, title: "[ZIF-12] something else" } : theirs)).exists).toBe(false);
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
      const v = { json: { ref: "ZIF-12", action: "create", notes: spec.taskNotes("ZIF-12", "").trim(), createBody: { title: "[ZIF-12] t" } } };
      const found = await runNode(wf, "Find by ref", { items: [{ json: shapeOf(spec, [spec.task({ id: "t9", notes: spec.taskNotes("ZIF-12"), done: false })]) }], nodes: { "Verify and filter": [v] } });
      expect(found[0].json).toMatchObject({ exists: true, taskId: "t9" });
      const none = await runNode(wf, "Find by ref", { items: [{ json: shapeOf(spec, [spec.task({ id: "t1", notes: spec.taskNotes("ZIF-120"), done: false })]) }], nodes: { "Verify and filter": [v] } });
      expect(none[0].json.exists).toBe(false);
      const linkExisting = await runNode(wf, "Prepare link", { items: [found[0]], nodes: { "Verify and filter": [v] } });
      expect(linkExisting[0].json.ziffr).toMatchObject({ op: "link", ref: "ZIF-12", system: spec.system, external_id: "t9" });
      const linkNew = await runNode(wf, "Prepare link", { items: [{ json: (spec.created ?? ((x: Param) => x))(spec.task({ id: "n1", notes: "", done: false })) }], nodes: { "Verify and filter": [v] } });
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
    const changes = async (tasks: Param[], state: Param) => (await runNode(wf, "Changes to tell Ziffr", { ...(await feedOf(spec, tasks)), state })).map((i) => i.json.ziffr);

    it("tells Ziffr a ticked task is done once, an un-ticked one is reopened, and a Reply line comes through", async () => {
      const state: Param = {};
      const t = (done: boolean, extra = "") => [spec.task({ id: "a", notes: spec.taskNotes("ZIF-12", extra), done }), spec.task({ id: "b", notes: "no ref here", done: true })];
      expect(await changes(t(false), state)).toEqual([]);
      expect(await changes(t(true), state)).toEqual([{ op: "done", system: spec.system, external_id: "a" }]);
      // Ziffr took it: remembered, so it is not sent again.
      const sent = [{ json: { ziffr: { op: "done", ref: "ZIF-12" }, op: "done", ref: "ZIF-12" } }];
      const answers = [{ json: { statusCode: 200 } }];
      await runNode(wf, "Remember what Ziffr took", { items: answers, nodes: { "Sign request": sent }, state });
      expect(await changes(t(true), state)).toEqual([]);
      expect(await changes(t(false), state)).toEqual([{ op: "reopen", system: spec.system, external_id: "a" }]);
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([{ op: "reopen", system: spec.system, external_id: "a" }, { op: "reply", system: spec.system, external_id: "a", text: "Draft is ready" }]);
      await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 200 } }, { json: { statusCode: 404 } }], nodes: { "Sign request": [{ json: { op: "reopen", ref: "ZIF-12" } }, { json: { op: "reply", ref: "ZIF-12", text: "Draft is ready" } }] }, state });
      // The reopen was taken; the reply got a 404 and is tried again.
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([{ op: "reply", system: spec.system, external_id: "a", text: "Draft is ready" }]);
      await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 409 } }], nodes: { "Sign request": [{ json: { op: "reply", ref: "ZIF-12", text: "Draft is ready" } }] }, state });
      expect(await changes(t(false, "Reply: Draft is ready"), state)).toEqual([]);
    });
    it("sends a reply longer than 1,000 characters once, cut, and names the Action by the task's own id", async () => {
      const state: Param = {};
      const long = "é".repeat(1001);
      const t = [spec.task({ id: "a", notes: spec.taskNotes("ZIF-12", "Reply: " + long), done: false })];
      const [first] = await changes(t, state);
      expect(first).toEqual({ op: "reply", system: spec.system, external_id: "a", text: "é".repeat(1000) });
      expect(first).not.toHaveProperty("ref");
      await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 200 } }], nodes: { "Sign request": [{ json: { op: "reply", ref: "ZIF-12", text: "é".repeat(1000) } }] }, state });
      expect(await changes(t, state)).toEqual([]);
    });
    it("forgets a ref that is gone from a list it saw whole, and sends at most 30 a run", async () => {
      const state: Param = { reported: { "ZIF-1": "done" } };
      await changes([], state);
      expect(state.reported).toEqual({});
      const s2: Param = { reported: {}, replied: { "ZIF-1": "x" } };
      await changes([], s2);
      expect(s2.replied).toEqual({});
      const many = Array.from({ length: 40 }, (_, i) => spec.task({ id: `t${i}`, notes: spec.taskNotes(`ZIF-${i + 1}`), done: true }));
      expect(await changes(many, {})).toHaveLength(30);
    });
    it("keeps going when a call fails outright, so one network error does not resend the whole batch", () => {
      expect((wf.nodes.find((n) => n.name === "Call Ziffr") as unknown as { onError: string }).onError).toBe("continueRegularOutput");
    });
    it("signs what it sends with the same scheme", async () => {
      const [s] = await runNode(wf, "Sign request", { items: [{ json: { ziffr: { op: "done", ref: "ZIF-12" } } }], nodes: { Settings: [{ json: { secret: SECRET, webhookId: "wh", ziffrUrl: "https://ziffr.example.test" } }] } });
      expect(verifyWebhookSignature([SECRET], s.json.timestamp as string, s.json.body as string, s.json.signature as string, NOW / 1000)).toBe(true);
      expect(s.json).toMatchObject({ op: "done", ref: "ZIF-12" });
    });
  });
}

// ---- Slack: a channel, not a list ----

describe.skipIf(!files.includes("slack-from-ziffr.json"))("slack: Ziffr to the channel, fixture run", () => {
  const wf = load("slack-from-ziffr.json");
  const CH = "C0123ABCD";
  const BOT = "UBOT0001";
  const settings = { channel: CH, botUserId: BOT };
  const slackLink = (name: string, external_id = `${CH}:1763630102.000100`) => { const f = fixture(name); f.data.external_ids = [{ system: "slack", external_id, url: "https://slack.example.test/x" }]; return f; };
  const verify = async (m: ReturnType<typeof delivered>, state: Param = {}, webhookId?: string) => {
    const [r] = await runNode(wf, "Verify and filter", { items: [{ json: { ...m.json, ...settings, ...(webhookId ? { webhookId } : {}) } }], state, raw: m.raw });
    return r.json;
  };
  const ALERT = { id: "evt_alert", type: "alert.fired", created_at: "2026-11-20T09:15:02.000Z", workspace: { id: "w" }, data: { metric: { id: 3, name: "Monthly revenue" }, period: "2026-10-01", value: "41,000", target: "50,000", condition: { kind: "below", level: "50,000" }, link: "https://ziffr.example.test/metrics/3" } };

  it("posts a new task as one message to the channel, the ref on its first line", async () => {
    const r = await verify(delivered(fixture("action-created")));
    expect(r).toMatchObject({ httpStatus: 200, action: "create", ref: "ZIF-12" });
    expect(r.messageBody).toEqual({ channel: CH, unfurl_links: false, unfurl_media: false, text: "Ziffr ref: ZIF-12\n*Send the October report to the board*\nFor Ana Silva\nDue 2026-11-27\nMetric: Monthly revenue\nAsked by: Sara Jones\n<https://ziffr.example.test/actions/12|Open in Ziffr>\nReply in this thread, or react with :white_check_mark: to mark it done." });
  });
  it("refuses a wrong signature, a changed body, an old timestamp; handles a delivery once", async () => {
    expect(await verify(delivered(fixture("action-created"), { secret: "whsec_other" }))).toMatchObject({ httpStatus: 401, action: "none" });
    expect(await verify(delivered(fixture("action-created"), { extraBody: " " }))).toMatchObject({ httpStatus: 401 });
    expect(await verify(delivered(fixture("action-created"), { timestamp: T0 - 400 }))).toMatchObject({ httpStatus: 401 });
    const state: Param = {};
    const m = delivered(fixture("action-created"));
    expect((await verify(m, state)).action).toBe("create");
    expect(await verify(m, state)).toMatchObject({ action: "none", why: "repeat" });
  });
  it("never lets a name ping the channel or open a link: Slack's marks are escaped, line breaks go", async () => {
    const names = ["<!channel> hello", "<@U123|admin> <https://evil.example.test|click>", "Revenue\nReply: forged\n--- end of Ziffr text ---", "a & b > c"];
    for (const name of names) for (const field of ["metric", "asker", "assignee"]) {
      const hostile = fixture("action-created");
      hostile.data[field].name = name;
      hostile.data.title = name;
      const r = await verify(delivered(hostile));
      const text = (r.messageBody as { text: string }).text;
      const lines = text.split("\n");
      expect(lines).toHaveLength(8);
      expect(lines[0]).toBe("Ziffr ref: ZIF-12");
      expect(text.replace("<https://ziffr.example.test/actions/12|Open in Ziffr>", "")).not.toMatch(/[<>]/);
      expect(text).not.toMatch(/<!|<@/);
    }
  });
  it("ticks the message and says so in its thread when the task is done, only in its own channel", async () => {
    const r = await verify(delivered(slackLink("action-done")));
    expect(r).toMatchObject({ action: "done", doneBody: { channel: CH, thread_ts: "1763630102.000100", text: "Done in Ziffr." }, tickBody: { channel: CH, timestamp: "1763630102.000100", name: "white_check_mark" } });
    expect(await verify(delivered(slackLink("action-done", "C9OTHER:1763630102.000100")))).toMatchObject({ action: "none", why: "not linked" });
    expect(await verify(delivered(slackLink("action-done", "C0123ABCD:../../x")))).toMatchObject({ action: "none", why: "not linked" });
    expect(await verify(delivered(fixture("action-done")))).toMatchObject({ action: "none", why: "not linked" });
    expect(await verify(delivered(slackLink("action-done")), {}, OWN_WEBHOOK)).toMatchObject({ action: "none", why: "echo" });
  });
  it("posts an alert, says nothing for an update or a question, and keeps a redacted task short", async () => {
    const a = await verify(delivered(ALERT));
    expect(a).toMatchObject({ action: "alert" });
    expect((a.alertBody as { text: string }).text).toBe(":rotating_light: *Alert:* Monthly revenue, 2026-10-01: 41,000 (target 50,000)\n<https://ziffr.example.test/metrics/3|Open in Ziffr>");
    expect(await verify(delivered(fixture("action-updated-reply")))).toMatchObject({ action: "none", why: "nothing to do" });
    expect(await verify(delivered({ ...fixture("action-created"), id: "evt_q", data: { ...fixture("action-created").data, kind: "question" } }))).toMatchObject({ action: "none", why: "question" });
    const red = await verify(delivered(fixture("action-created-redacted")));
    expect((red.messageBody as { text: string }).text).toContain("A Ziffr task for you (");
    expect((red.messageBody as { text: string }).text).not.toMatch(/Metric:|Asked by:|For /);
    expect(await verify(delivered({ ...fixture("action-created"), id: "evt_l", data: { ...fixture("action-created").data, external_ids: [{ system: "slack", external_id: `${CH}:1.2` }] } }))).toMatchObject({ action: "none", why: "already linked" });
  });
  it("answers a ping with 200 and garbage that is signed with 400", async () => {
    expect(await verify(delivered(fixture("ping")))).toMatchObject({ httpStatus: 200, action: "none" });
    const sig = signWebhookBody([SECRET], T0, "not json");
    const [r] = await runNode(wf, "Verify and filter", { items: [{ json: { headers: { "x-ziffr-timestamp": String(T0), "x-ziffr-signature": sig }, secret: SECRET, webhookId: "w", ...settings } }], raw: "not json" });
    expect(r.json.httpStatus).toBe(400);
  });
  it("finds a first event's message only among the bot's own, and stops when Slack says no", async () => {
    const v = { json: { ref: "ZIF-12", action: "create" } };
    const nodes = { "Verify and filter": [v], Settings: [{ json: settings }] };
    const hist = (messages: Param[]) => ({ items: [{ json: { ok: true, messages } }], nodes });
    const mine = { type: "message", user: BOT, bot_id: "B1", ts: "1700000000.000100", text: "Ziffr ref: ZIF-12\n*x*" };
    const found = await runNode(wf, "Find by ref", hist([{ ...mine, user: "UHUMAN", bot_id: undefined }, mine]));
    expect(found[0].json).toMatchObject({ exists: true, taskId: `${CH}:1700000000.000100` });
    expect((await runNode(wf, "Find by ref", hist([{ ...mine, user: "UHUMAN" }, { ...mine, bot_id: undefined }, { ...mine, text: "Ziffr ref: ZIF-120" }])))[0].json.exists).toBe(false);
    await expect(runNode(wf, "Find by ref", { items: [{ json: { ok: false, error: "ratelimited" } }], nodes })).rejects.toThrow("ratelimited");
  });
  it("links the posted message as channel:ts, or the one found, and refuses to link a failed post", async () => {
    const nodes = { "Verify and filter": [{ json: { ref: "ZIF-12" } }] };
    const [l] = await runNode(wf, "Prepare link", { items: [{ json: { ok: true, channel: CH, ts: "1.2" } }], nodes });
    expect(l.json.ziffr).toMatchObject({ op: "link", ref: "ZIF-12", system: "slack", external_id: `${CH}:1.2` });
    const [e] = await runNode(wf, "Prepare link", { items: [{ json: { exists: true, taskId: `${CH}:9.9`, taskUrl: "https://slack.example.test/x" } }], nodes });
    expect(e.json.ziffr).toMatchObject({ external_id: `${CH}:9.9` });
    await expect(runNode(wf, "Prepare link", { items: [{ json: { ok: false, error: "not_in_channel" } }], nodes })).rejects.toThrow("not_in_channel");
  });
  it("signs a request that Ziffr's own verifier accepts", async () => {
    const [s] = await runNode(wf, "Sign request", { items: [{ json: { ziffr: { op: "link", ref: "ZIF-12", system: "slack", external_id: `${CH}:1.2` } } }], nodes: { Settings: [{ json: { secret: SECRET, webhookId: "wh", ziffrUrl: "https://ziffr.example.test" } }] } });
    expect(verifyWebhookSignature([SECRET], s.json.timestamp as string, s.json.body as string, s.json.signature as string, NOW / 1000)).toBe(true);
  });
});

describe.skipIf(!files.includes("slack-to-ziffr.json"))("slack: the channel to Ziffr, fixture run", () => {
  const wf = load("slack-to-ziffr.json");
  const CH = "C0123ABCD";
  const BOT = "UBOT0001";
  const ANA = "UANA0001";
  const cfg = { channel: CH, botUserId: BOT, allowedUsers: `${ANA}, UBEN0002` };
  const ours = (messages: Param[]) => runNode(wf, "Our messages", { items: [{ json: { ok: true, messages } }], nodes: { Settings: [{ json: cfg }] } });
  const bot = (ref: string, ts: string, extra: Param = {}) => ({ type: "message", user: BOT, bot_id: "B1", ts, text: `Ziffr ref: ${ref}\n*x*`, ...extra });
  const root = (ts = "1700000000.000100", reactions?: Param[]) => ({ ts, text: "Ziffr ref: ZIF-12\n*x*", user: BOT, bot_id: "B1", ...(reactions ? { reactions } : {}) });
  const reply = (ts: string, text: string, extra: Param = {}) => ({ ts, thread_ts: "1700000000.000100", user: ANA, text, ...extra });
  const changes = async (thread: Param[], state: Param, cfgOver: Param = {}) => {
    const rootItem = { json: { ref: "ZIF-12", ts: "1700000000.000100", channel: CH, whole: true } };
    return (await runNode(wf, "Changes to tell Ziffr", { items: [{ json: { ok: true, messages: thread } }], nodes: { Settings: [{ json: { ...cfg, ...cfgOver } }], "Our messages": [rootItem] }, state })).map((x) => x.json);
  };
  const EXT = `${CH}:1700000000.000100`;

  it("takes only top-level messages of the bot that start with a ref, the newest 40", async () => {
    const r = await ours([bot("ZIF-12", "1.1"), bot("ZIF-13", "1.2", { user: "UHUMAN", bot_id: undefined }), bot("ZIF-14", "1.3", { bot_id: undefined }), bot("ZIF-15", "1.4", { thread_ts: "0.9" }), bot("ZIF-16", "1.5", { subtype: "bot_message" }), bot("ZIF-17", "1.6", { text: "hello\nZiffr ref: ZIF-17" }), bot("ZIF-18", "1.7", { thread_ts: "1.7" })]);
    expect(r.map((x) => x.json.ref)).toEqual(["ZIF-12", "ZIF-18"]);
    expect(r[0].json).toMatchObject({ ts: "1.1", channel: CH, whole: true });
    const many = await ours(Array.from({ length: 45 }, (_, i) => bot(`ZIF-${i + 1}`, `1.${i}`)));
    expect(many).toHaveLength(40);
    expect(many[0].json.whole).toBe(false);
    await expect(runNode(wf, "Our messages", { items: [{ json: { ok: false, error: "channel_not_found" } }], nodes: { Settings: [{ json: cfg }] } })).rejects.toThrow("channel_not_found");
  });
  it("marks the Task done by a reaction once, and reopens when the reaction goes", async () => {
    const state: Param = {};
    expect(await changes([root()], state)).toEqual([]);
    const ticked = [root("1700000000.000100", [{ name: "white_check_mark", users: [ANA], count: 1 }])];
    expect(await changes(ticked, state)).toEqual([{ ref: "ZIF-12", ziffr: { op: "done", system: "slack", external_id: EXT } }]);
    await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 200 } }], nodes: { "Sign request": [{ json: { op: "done", ref: "ZIF-12" } }] }, state });
    expect(await changes(ticked, state)).toEqual([]);
    expect(await changes([root()], state)).toEqual([{ ref: "ZIF-12", ziffr: { op: "reopen", system: "slack", external_id: EXT } }]);
  });
  it("lets only the people named in Settings answer, and the bot's own tick counts for nothing", async () => {
    const by = (users: string[], name = "white_check_mark") => [root("1700000000.000100", [{ name, users, count: users.length }])];
    expect(await changes(by(["USTRANGER"]), {})).toEqual([]);
    expect(await changes(by([BOT]), {})).toEqual([]);
    expect(await changes(by([ANA], "thumbsup"), {})).toEqual([]);
    expect(await changes(by(["USTRANGER"]), {}, { allowedUsers: "ANYONE" })).toHaveLength(1);
    expect(await changes(by(["USTRANGER"]), {}, { allowedUsers: "REPLACE-WITH-THE-SLACK-USER-IDS-WHO-MAY-ANSWER" })).toEqual([]);
    expect(await changes(by([ANA]), {}, { allowedUsers: "" })).toEqual([]);
  });
  it("sends each reply in the message's thread once, in order, and none from anywhere else", async () => {
    const state: Param = {};
    const thread = [root(), reply("1700000001.000100", "First"), reply("1700000002.000100", "Second\nline"), reply("1700000003.000100", "from a stranger", { user: "USTRANGER" }), reply("1700000004.000100", "by the bot", { user: BOT }), reply("1700000005.000100", "by an app", { bot_id: "B9" }), reply("1700000006.000100", "joined", { subtype: "channel_join" }), reply("1700000007.000100", "elsewhere", { thread_ts: "1699999999.000100" }), reply("1700000008.000100", "also in the channel", { subtype: "thread_broadcast" }), reply("1700000009.000100", "   ")];
    const out = await changes(thread, state);
    expect(out.map((x) => (x.ziffr as Param).text)).toEqual(["First", "Second line", "also in the channel"]);
    expect(out[0]).toEqual({ ref: "ZIF-12", ts: "1700000001.000100", ziffr: { op: "reply", system: "slack", external_id: EXT, text: "First" } });
    for (const o of out) expect(o.ziffr).not.toHaveProperty("ref");
    // Ziffr took the first two; the third got a 500 and is tried again, and the later ones wait for it.
    await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 200 } }, { json: { statusCode: 409 } }, { json: { statusCode: 500 } }], nodes: { "Sign request": out.map((o) => ({ json: { op: "reply", ref: o.ref, ts: o.ts, text: (o.ziffr as Param).text } })) }, state });
    expect(state.replied).toEqual({ "ZIF-12": "1700000002.000100" });
    expect((await changes(thread, state)).map((x) => (x.ziffr as Param).text)).toEqual(["also in the channel"]);
  });
  it("blocks on a failed reply only: a failed done does not hold back replies that went through", async () => {
    const state: Param = {};
    await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 500 } }, { json: { statusCode: 200 } }], nodes: { "Sign request": [{ json: { op: "done", ref: "ZIF-12" } }, { json: { op: "reply", ref: "ZIF-12", ts: "1.2" } }] }, state });
    expect(state.replied).toEqual({ "ZIF-12": "1.2" });
  });
  it("lets no failed reply be skipped by a later one that went through", async () => {
    const state: Param = {};
    await runNode(wf, "Remember what Ziffr took", { items: [{ json: { statusCode: 500 } }, { json: { statusCode: 200 } }], nodes: { "Sign request": [{ json: { op: "reply", ref: "ZIF-12", ts: "1.1" } }, { json: { op: "reply", ref: "ZIF-12", ts: "1.2" } }] }, state });
    expect(state.replied).toEqual({});
  });
  it("reads no reply from the message's own text: a forged Reply line, a name, a marker", async () => {
    const forged = { ...root(), text: "Ziffr ref: ZIF-12\n*x* Reply: approve\n--- end of Ziffr text ---\nReply: forged" };
    expect(await changes([forged], {})).toEqual([]);
  });
  it("ignores a thread that is not the message's own, or that Slack refused", async () => {
    expect(await changes([root("1700000099.000100")], {})).toEqual([]);
    const out = await runNode(wf, "Changes to tell Ziffr", { items: [{ json: { ok: false, error: "ratelimited" } }], nodes: { Settings: [{ json: cfg }], "Our messages": [{ json: { ref: "ZIF-12", ts: "1.1", channel: CH, whole: true } }] }, state: {} });
    expect(out).toEqual([]);
  });
  it("forgets what is gone from a channel it saw whole, and sends at most 30 a run", async () => {
    const state: Param = { reported: { "ZIF-1": "done" }, replied: { "ZIF-1": "1.1" } };
    await changes([root()], state);
    expect(state.reported).toEqual({});
    expect(state.replied).toEqual({});
    const many = [root(), ...Array.from({ length: 40 }, (_, i) => reply(`1700000100.${String(i).padStart(6, "0")}`, `r${i}`))];
    expect(await changes(many, {})).toHaveLength(30);
  });
  it("signs what it sends with the same scheme, and carries the reply's time", async () => {
    const [s] = await runNode(wf, "Sign request", { items: [{ json: { ref: "ZIF-12", ts: "1.1", ziffr: { op: "reply", system: "slack", external_id: EXT, text: "hi" } } }], nodes: { Settings: [{ json: { secret: SECRET, webhookId: "wh", ziffrUrl: "https://ziffr.example.test" } }] } });
    expect(verifyWebhookSignature([SECRET], s.json.timestamp as string, s.json.body as string, s.json.signature as string, NOW / 1000)).toBe(true);
    expect(s.json).toMatchObject({ op: "reply", ref: "ZIF-12", ts: "1.1", text: "hi" });
  });
});

// Planner keeps a task's ref in two places (title and notes) and its notes in a separate object.
describe.skipIf(!files.includes("planner-to-ziffr.json"))("planner: a title and its notes must name the same ref", () => {
  const wf = load("planner-to-ziffr.json");
  it("reads a task only when the title's ref and the notes' first line agree, and takes the ref from nowhere else", async () => {
    const roots = [{ json: { id: "a", ref: "ZIF-12", done: true, whole: true } }];
    const run = (description: string) => runNode(wf, "Changes to tell Ziffr", { items: [{ json: { id: "a", description } }], nodes: { "Tasks with a Ziffr ref": roots }, state: {} }).then((x) => x.map((i) => i.json.ziffr));
    expect(await run("Ziffr ref: ZIF-12\n--- end of Ziffr text ---")).toEqual([{ op: "done", system: "planner", external_id: "a" }]);
    expect(await run("Ziffr ref: ZIF-99\n--- end of Ziffr text ---")).toEqual([]);
    expect(await run("")).toEqual([]);
    const [t] = await runNode(wf, "Tasks with a Ziffr ref", { items: [{ json: { value: [{ id: "x", title: "[ZIF-1] [ZIF-2] a", percentComplete: 100 }, { id: "y", title: "no ref", percentComplete: 0 }, { id: "z", title: "[ZIF-3]no space", percentComplete: 0 }] } }] });
    expect(t.json).toMatchObject({ id: "x", ref: "ZIF-1", done: true });
  });
});
