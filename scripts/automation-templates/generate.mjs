// Automation Templates (docs/automations): the one script that writes every n8n workflow file. The workflows share
// their checks (signature, repeats, echoes, ids, exact adoption, replies only below the closing marker), so they are
// generated from the code in ./code, the per-system code in ./helpers and the settings below, never edited by hand.
//   node scripts/automation-templates/generate.mjs          writes docs/automations/*.json
//   node scripts/automation-templates/generate.mjs --check  fails when a file differs (CI runs this as a test)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = new URL("./", import.meta.url);
const read = (p) => readFileSync(new URL(p, here), "utf8");
const code = (name) => read(`code/${name}.js`);
const helpers = (name) => read(`helpers/${name}.js`).trim();
const BASE = JSON.parse(read("base-nodes.json"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const fill = (tpl, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`@@${k}@@`).join(v), tpl);

// Node ids are derived from the workflow and node name, so regenerating changes nothing.
const NS = Buffer.from("6f1d4c529a3e4b7d8c112a5e7f90b1c3", "hex");
function nid(wf, name) {
  const h = createHash("sha1").update(NS).update(`${wf}/${name}`, "utf8").digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

class WF {
  constructor(key, name) { Object.assign(this, { key, name, nodes: [], conn: {} }); }
  add(name, type, parameters, x, y, version = 1, extra = {}) {
    const n = { parameters, id: nid(this.key, name), name, type, typeVersion: version, position: [x, y], ...extra };
    this.nodes.push(n);
    return n;
  }
  link(a, b, out = 0) {
    const outs = (this.conn[a] ??= { main: [] }).main;
    while (outs.length <= out) outs.push([]);
    outs[out].push({ node: b, type: "main", index: 0 });
  }
  copy(node, x, y) {
    const n = clone(node);
    n.id = nid(this.key, n.name);
    n.position = [x, y];
    this.nodes.push(n);
    return n;
  }
  code(name, js, x, y) { return this.add(name, "n8n-nodes-base.code", { jsCode: js }, x, y, 2); }
  http(name, method, url, cred, x, y, { body, headers, query } = {}) {
    const p = { method, url };
    let creds;
    if (cred[0] === "predefined") { p.authentication = "predefinedCredentialType"; p.nodeCredentialType = cred[1]; }
    else { p.authentication = "genericCredentialType"; p.genericAuthType = cred[1]; }
    creds = { [cred[1]]: { name: cred[2] } };
    if (query) { p.sendQuery = true; p.queryParameters = { parameters: query.map(([name, value]) => ({ name, value })) }; }
    if (headers) { p.sendHeaders = true; p.headerParameters = { parameters: headers.map(([name, value]) => ({ name, value })) }; }
    if (body) Object.assign(p, { sendBody: true, contentType: "json", specifyBody: "json", jsonBody: body });
    p.options = {};
    return this.add(name, "n8n-nodes-base.httpRequest", p, x, y, 4.2, { credentials: creds });
  }
  settings(fields, x, y) {
    const assignments = fields.map(([name, value]) => ({ id: nid(this.key, "set" + name), name, value, type: "string" }));
    return this.add("Settings", "n8n-nodes-base.set", { assignments: { assignments }, includeOtherFields: true, options: { includeBinary: true } }, x, y, 3.4);
  }
  note(text, height = 300) { return this.add("Read me", "n8n-nodes-base.stickyNote", { content: text, width: 460, height }, -60, -60); }
  file() { return { name: this.name, nodes: this.nodes, connections: this.conn, settings: { executionOrder: "v1", ...(this.timezone ? { timezone: this.timezone } : {}) }, pinData: {}, active: false, tags: [] }; }
}

/** The task-list workflows also name whose list this is: they take only that person's Tasks (a Webhook is sent every Action of the Workspace). */
const ASSIGNEE_FIELD = ["assigneeEmail", "REPLACE-WITH-THE-EMAIL-OF-THE-LIST-OWNER"];
const BASE_FIELDS = [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"], ["webhookId", "REPLACE-WITH-THE-WEBHOOK-ID"], ["secret", "REPLACE-WITH-THE-WEBHOOK-SECRET"]];
const SELF_HOSTED = "Self-hosted n8n: set NODE_FUNCTION_ALLOW_BUILTIN=crypto.";

function verifyCode(s, { extra = "() => ({})", close = "patch", title = "String(d.title || d.ref)", helperFile }) {
  return fill(code("verify"), { LABEL: s.label, SYSTEM: s.system, HELPERS: helpers(helperFile), EXTRA: extra, TITLE: title, CLOSE: close });
}
const findCode = (s, helperFile, match) => fill(code("find"), { SYSTEM: s.system, HELPERS: helpers(helperFile), MATCH: match ?? "t.notes.replace(/\\r\\n/g, '\\n').trim() === String(v.notes).trim()" });
const prepareCode = (s, helperFile) => fill(code("prepare"), { SYSTEM: s.system, HELPERS: helpers(helperFile) });
function changesCode(s, helperFile, { gettasks = "TASKS($input.first().json)", refcheck = "", whole = "tasks.length < LIMIT" } = {}) {
  return fill(code("changes"), { LABEL: s.label, SYSTEM: s.system, HELPERS: helpers(helperFile), GETTASKS: gettasks, WHOLE: whole }).replace("@@REFCHECK@@\n", refcheck);
}

function sharedTo(w, s, fields, steps, noteText, { gettasks, refcheck, whole, helperFile }) {
  w.note(`${s.label} to Ziffr\n\n${noteText}`, s.noteHeight ?? 300);
  w.add("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } }, 0, 300, 1.2);
  w.settings([...BASE_FIELDS, ...fields], 220, 300);
  w.link("Every 5 minutes", "Settings");
  let last = "Settings"; let x = 440;
  for (const step of steps) { const n = step(x, 300); x += 220; w.link(last, n.name); last = n.name; }
  w.code("Changes to tell Ziffr", changesCode(s, helperFile, { gettasks, refcheck, whole }), x, 300);
  w.link(last, "Changes to tell Ziffr");
  w.copy(BASE.signTo, x + 220, 300);
  // A network error must not throw away the answers of the calls that went through.
  w.copy(BASE.callTo, x + 440, 300).onError = "continueRegularOutput";
  w.copy(BASE.remember, x + 660, 300);
  for (const [a, b] of [["Changes to tell Ziffr", "Sign request"], ["Sign request", "Call Ziffr"], ["Call Ziffr", "Remember what Ziffr took"]]) w.link(a, b);
}

const FROM_EVENTS = "(events: action.created, action.updated, action.done)";
const sticky = (s, listIds, nodes) => `Ziffr to ${s.label}\n\n1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, the email address you have in Ziffr (assigneeEmail) and ${listIds}.\n2. ${s.credNote(nodes)}\n3. Replace the Webhook path with a long random string, activate the workflow and put its production URL into the Webhook in Ziffr ${FROM_EVENTS}.\n\n${SELF_HOSTED} Details: docs/automations/${s.file}.md`;

/** A task list with a create, an update and a list call (To Do, Google Tasks, Asana): the same graph. */
function listFrom(s) {
  const w = new WF(`${s.key}-from`, `Ziffr to ${s.label}`);
  w.note(sticky(s, s.listIds, "the three HTTP Request nodes"), s.noteHeight ?? 300);
  w.copy(BASE.hook, 0, 300); w.settings([...BASE_FIELDS, ASSIGNEE_FIELD, ...s.fields], 220, 300);
  w.code("Verify and filter", verifyCode(s, { helperFile: s.helper }), 440, 300);
  w.copy(BASE.answer, 660, 300); w.copy(BASE.switch, 880, 300);
  w.http("List tasks", "GET", s.listUrl, s.cred, 1100, 200, { query: s.listQuery });
  w.code("Find by ref", findCode(s, s.helper), 1320, 200);
  w.copy(BASE.if, 1540, 200);
  w.http("Create task", "POST", s.listUrl, s.cred, 1760, 300, { body: "={{ JSON.stringify($('Verify and filter').first().json.createBody) }}" });
  w.code("Prepare link", prepareCode(s, s.helper), 1980, 200);
  w.http("Update task", s.updateMethod, s.updateUrl, s.cred, 1100, 420, { body: "={{ JSON.stringify($json.patchBody) }}" });
  w.copy(BASE.signFrom, 2200, 200); w.copy(BASE.callFrom, 2420, 200);
  for (const [a, b, o] of [["Ziffr event", "Settings", 0], ["Settings", "Verify and filter", 0], ["Verify and filter", "Answer Ziffr", 0], ["Answer Ziffr", "What to do", 0], ["What to do", "List tasks", 0], ["What to do", "Update task", 1], ["List tasks", "Find by ref", 0], ["Find by ref", "Already there?", 0], ["Already there?", "Prepare link", 0], ["Already there?", "Create task", 1], ["Create task", "Prepare link", 0], ["Prepare link", "Sign request", 0], ["Sign request", "Call Ziffr", 0]]) w.link(a, b, o);
  return w;
}
function listTo(s) {
  const w = new WF(`${s.key}-to`, `${s.label} to Ziffr`);
  sharedTo(w, s, s.fields, [(x, y) => w.http("List tasks", "GET", s.listUrl, s.cred, x, y, { query: s.listQueryTo ?? s.listQuery })], s.toNote, { helperFile: s.helper });
  return w;
}

const ASANA_API = "https://app.asana.com/api/1.0";
const SYSTEMS_LIST = [
  {
    key: "microsoft-todo", system: "microsoft-todo", label: "Microsoft To Do", file: "microsoft-todo", helper: "microsoft-todo",
    cred: ["predefined", "microsoftToDoOAuth2Api", "Microsoft To Do account"], fields: [["listId", "REPLACE-WITH-THE-LIST-ID"]],
    listIds: "the id of the To Do list (from Microsoft Graph: `GET /me/todo/lists`)",
    credNote: (n) => `Add the Microsoft To Do credential to ${n}.`,
    listUrl: "=https://graph.microsoft.com/v1.0/me/todo/lists/{{ $('Settings').first().json.listId }}/tasks", listQuery: [["$top", "100"]],
    updateMethod: "PATCH", updateUrl: "=https://graph.microsoft.com/v1.0/me/todo/lists/{{ $('Settings').first().json.listId }}/tasks/{{ encodeURIComponent($json.taskId) }}",
    toNote: "1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, and the id of the To Do list (from Microsoft Graph: `GET /me/todo/lists`).\n2. Add the Microsoft To Do credential to the List tasks node.\n3. Activate the workflow. Every 5 minutes it tells Ziffr which tasks were ticked or un-ticked, and passes on a line starting \"Reply:\" in a task's notes.\n\nSelf-hosted n8n: set NODE_FUNCTION_ALLOW_BUILTIN=crypto. Details: docs/automations/microsoft-todo.md",
  },
  {
    key: "google-tasks", system: "google-tasks", label: "Google Tasks", file: "google-tasks", helper: "google-tasks",
    cred: ["predefined", "googleTasksOAuth2Api", "Google Tasks account"], fields: [["listId", "REPLACE-WITH-THE-LIST-ID"]],
    listIds: "the id of the task list (`@default` is your main list)",
    credNote: (n) => `Add the Google Tasks credential to ${n}.`,
    listUrl: "=https://tasks.googleapis.com/tasks/v1/lists/{{ $('Settings').first().json.listId }}/tasks", listQuery: [["maxResults", "100"], ["showCompleted", "true"], ["showHidden", "true"]],
    listQueryTo: [["maxResults", "100"], ["showCompleted", "true"], ["showHidden", "true"], ["updatedMin", "={{ new Date(Date.now() - 7 * 864e5).toISOString() }}"]],
    updateMethod: "PATCH", updateUrl: "=https://tasks.googleapis.com/tasks/v1/lists/{{ $('Settings').first().json.listId }}/tasks/{{ encodeURIComponent($json.taskId) }}",
    toNote: "1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, and the id of the task list (`@default` is your main list).\n2. Add the Google Tasks credential to the List tasks node.\n3. Activate the workflow. Every 5 minutes it tells Ziffr which tasks were ticked or un-ticked, and passes on a line starting \"Reply:\" in a task's notes.\n\nSelf-hosted n8n: set NODE_FUNCTION_ALLOW_BUILTIN=crypto. Details: docs/automations/google-tasks.md",
  },
  {
    key: "asana", system: "asana", label: "Asana", file: "asana", helper: "asana",
    cred: ["predefined", "asanaOAuth2Api", "Asana account"], fields: [["projectId", "REPLACE-WITH-THE-PROJECT-ID"]],
    listIds: "the id of the Asana project (the number in the project's address)",
    credNote: (n) => `Add the Asana credential to ${n}.`,
    listUrl: `=${ASANA_API}/projects/{{ $('Settings').first().json.projectId }}/tasks`, listQuery: [["opt_fields", "name,notes,completed,permalink_url"], ["limit", "100"]],
    createUrl: `${ASANA_API}/tasks`,
    updateMethod: "PUT", updateUrl: `=${ASANA_API}/tasks/{{ encodeURIComponent($json.taskId) }}`,
    toNote: "1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, and the id of the Asana project.\n2. Add the Asana credential to the List tasks node.\n3. Activate the workflow. Every 5 minutes it tells Ziffr which tasks were completed or reopened, and passes on a line starting \"Reply:\" in a task's description.\n\nSelf-hosted n8n: set NODE_FUNCTION_ALLOW_BUILTIN=crypto. Details: docs/automations/asana.md",
  },
];

function asanaFrom(s) {
  const w = listFrom(s);
  w.nodes.find((n) => n.name === "Create task").parameters.url = s.createUrl;
  return w;
}

// ---- Todoist: closes with a call of its own, and lists open and completed tasks apart ----
const TODO_API = "https://api.todoist.com/api/v1";
const TODOIST = { key: "todoist", system: "todoist", label: "Todoist", file: "todoist", helper: "todoist", cred: ["predefined", "todoistApi", "Todoist account"], fields: [["projectId", "REPLACE-WITH-THE-PROJECT-ID"]] };
function todoistFrom() {
  const s = TODOIST;
  const w = new WF("todoist-from", "Ziffr to Todoist");
  w.note("Ziffr to Todoist\n\n1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, the email address you have in Ziffr (assigneeEmail) and the id of the Todoist project.\n2. Add the Todoist credential to the HTTP Request nodes.\n3. Replace the Webhook path with a long random string, activate the workflow and put its production URL into the Webhook in Ziffr " + FROM_EVENTS + ".\n\n" + SELF_HOSTED + " Details: docs/automations/todoist.md");
  w.copy(BASE.hook, 0, 300); w.settings([...BASE_FIELDS, ASSIGNEE_FIELD, ...s.fields], 220, 300);
  w.code("Verify and filter", verifyCode(s, { helperFile: "todoist", close: "close" }), 440, 300);
  w.copy(BASE.answer, 660, 300);
  const sw = clone(BASE.switch);
  const third = clone(sw.parameters.rules.values[1]);
  third.conditions.conditions[0].id = nid("todoist-from", "swclose"); third.conditions.conditions[0].rightValue = "close"; third.outputKey = "close";
  sw.parameters.rules.values.push(third);
  w.copy(sw, 880, 300);
  const proj = ["project_id", "={{ $('Settings').first().json.projectId }}"];
  w.http("List tasks", "GET", `${TODO_API}/tasks`, s.cred, 1100, 200, { query: [proj, ["limit", "100"]] });
  w.code("Find by ref", findCode(s, "todoist"), 1320, 200);
  w.copy(BASE.if, 1540, 200);
  w.http("Create task", "POST", `${TODO_API}/tasks`, s.cred, 1760, 300, { body: "={{ JSON.stringify($('Verify and filter').first().json.createBody) }}" });
  w.code("Prepare link", prepareCode(s, "todoist"), 1980, 200);
  w.http("Update task", "POST", `=${TODO_API}/tasks/{{ encodeURIComponent($json.taskId) }}`, s.cred, 1100, 420, { body: "={{ JSON.stringify($json.patchBody) }}" });
  w.http("Close task", "POST", `=${TODO_API}/tasks/{{ encodeURIComponent($json.taskId) }}/close`, s.cred, 1100, 560);
  w.copy(BASE.signFrom, 2200, 200); w.copy(BASE.callFrom, 2420, 200);
  for (const [a, b, o] of [["Ziffr event", "Settings", 0], ["Settings", "Verify and filter", 0], ["Verify and filter", "Answer Ziffr", 0], ["Answer Ziffr", "What to do", 0], ["What to do", "List tasks", 0], ["What to do", "Update task", 1], ["What to do", "Close task", 2], ["List tasks", "Find by ref", 0], ["Find by ref", "Already there?", 0], ["Already there?", "Prepare link", 0], ["Already there?", "Create task", 1], ["Create task", "Prepare link", 0], ["Prepare link", "Sign request", 0], ["Sign request", "Call Ziffr", 0]]) w.link(a, b, o);
  return w;
}
function todoistTo() {
  const s = TODOIST;
  const w = new WF("todoist-to", "Todoist to Ziffr");
  const proj = ["project_id", "={{ $('Settings').first().json.projectId }}"];
  const active = (x, y) => w.http("List active tasks", "GET", `${TODO_API}/tasks`, s.cred, x, y, { query: [proj, ["limit", "100"]] });
  const completed = (x, y) => w.http("List completed tasks", "GET", `${TODO_API}/tasks/completed/by_completion_date`, s.cred, x, y, { query: [proj, ["since", "={{ new Date(Date.now() - 7 * 86400000).toISOString() }}"], ["until", "={{ new Date().toISOString() }}"], ["limit", "100"]] });
  sharedTo(w, s, s.fields, [active, completed], "1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, and the id of the Todoist project.\n2. Add the Todoist credential to the two List nodes.\n3. Activate the workflow. Every 5 minutes it tells Ziffr which tasks were completed in the last 7 days or reopened, and passes on a line starting \"Reply:\" in a task's description.\n\n" + SELF_HOSTED + " Details: docs/automations/todoist.md", { helperFile: "todoist", gettasks: "TASKS($('List active tasks').first().json, $input.first().json)" });
  return w;
}

// ---- Planner: the text lives in a separate details object; the ref leads the title and the notes ----
const PLAN_API = "https://graph.microsoft.com/v1.0/planner";
const PLANNER = { key: "planner", system: "planner", label: "Planner", file: "planner", helper: "planner", cred: ["generic", "oAuth2Api", "Microsoft Graph (Planner)"], fields: [["planId", "REPLACE-WITH-THE-PLAN-ID"]] };
function plannerFrom() {
  const s = PLANNER;
  const w = new WF("planner-from", "Ziffr to Planner");
  w.note("Ziffr to Planner\n\n1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, the email address you have in Ziffr (assigneeEmail) and the id of the plan and of the bucket new tasks go into (Microsoft Graph: GET /me/planner/plans, GET /planner/plans/{id}/buckets).\n2. Add a credential \"OAuth2 API\" for Microsoft Graph (scope Tasks.ReadWrite) to the HTTP Request nodes.\n3. Replace the Webhook path with a long random string, activate the workflow and put its production URL into the Webhook in Ziffr " + FROM_EVENTS + ".\n\n" + SELF_HOSTED + " Details: docs/automations/planner.md", 340);
  w.copy(BASE.hook, 0, 300); w.settings([...BASE_FIELDS, ASSIGNEE_FIELD, ["planId", "REPLACE-WITH-THE-PLAN-ID"], ["bucketId", "REPLACE-WITH-THE-BUCKET-ID"]], 220, 300);
  w.code("Verify and filter", verifyCode(s, { helperFile: "planner", extra: "(notes) => ({ detailsBody: { description: notes } })", title: "clean(d.title || d.ref)" }), 440, 300);
  w.copy(BASE.answer, 660, 300); w.copy(BASE.switch, 880, 300);
  w.http("List tasks", "GET", `=${PLAN_API}/plans/{{ $('Settings').first().json.planId }}/tasks`, s.cred, 1100, 200);
  w.code("Find by ref", findCode(s, "planner", "t.title === v.createBody.title"), 1320, 200);
  w.copy(BASE.if, 1540, 200);
  w.http("Create task", "POST", `${PLAN_API}/tasks`, s.cred, 1760, 300, { body: "={{ JSON.stringify($('Verify and filter').first().json.createBody) }}" });
  w.http("Read details", "GET", `=${PLAN_API}/tasks/{{ encodeURIComponent($json.id) }}/details`, s.cred, 1980, 300);
  w.http("Write notes", "PATCH", `=${PLAN_API}/tasks/{{ encodeURIComponent($json.id) }}/details`, s.cred, 2200, 300, { body: "={{ JSON.stringify($('Verify and filter').first().json.detailsBody) }}", headers: [["If-Match", "={{ $json['@odata.etag'] }}"], ["Prefer", "return=representation"]] });
  w.code("Prepare link", prepareCode(s, "planner"), 2420, 200);
  w.http("Read task", "GET", `=${PLAN_API}/tasks/{{ encodeURIComponent($json.taskId) }}`, s.cred, 1100, 420);
  w.http("Update task", "PATCH", `=${PLAN_API}/tasks/{{ encodeURIComponent($json.id) }}`, s.cred, 1320, 420, { body: "={{ JSON.stringify($('Verify and filter').first().json.patchBody) }}", headers: [["If-Match", "={{ $json['@odata.etag'] }}"]] });
  w.copy(BASE.signFrom, 2640, 200); w.copy(BASE.callFrom, 2860, 200);
  for (const [a, b, o] of [["Ziffr event", "Settings", 0], ["Settings", "Verify and filter", 0], ["Verify and filter", "Answer Ziffr", 0], ["Answer Ziffr", "What to do", 0], ["What to do", "List tasks", 0], ["What to do", "Read task", 1], ["Read task", "Update task", 0], ["List tasks", "Find by ref", 0], ["Find by ref", "Already there?", 0], ["Already there?", "Prepare link", 0], ["Already there?", "Create task", 1], ["Create task", "Read details", 0], ["Read details", "Write notes", 0], ["Write notes", "Prepare link", 0], ["Prepare link", "Sign request", 0], ["Sign request", "Call Ziffr", 0]]) w.link(a, b, o);
  return w;
}
function plannerTo() {
  const s = PLANNER;
  const w = new WF("planner-to", "Planner to Ziffr");
  const list = (x, y) => w.http("List tasks", "GET", `=${PLAN_API}/plans/{{ $('Settings').first().json.planId }}/tasks`, s.cred, x, y);
  const refs = (x, y) => w.code("Tasks with a Ziffr ref", code("planner-refs"), x, y);
  const details = (x, y) => w.http("Read notes", "GET", `=${PLAN_API}/tasks/{{ encodeURIComponent($json.id) }}/details`, s.cred, x, y);
  sharedTo(w, s, [["planId", "REPLACE-WITH-THE-PLAN-ID"]], [list, refs, details], "1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, and the id of the plan.\n2. Add the Microsoft Graph \"OAuth2 API\" credential to the List tasks and Read notes nodes.\n3. Activate the workflow. Every 5 minutes it tells Ziffr which tasks were completed or reopened, and passes on a line starting \"Reply:\" in a task's notes (its description).\n\n" + SELF_HOSTED + " Details: docs/automations/planner.md", {
    helperFile: "planner",
    gettasks: "roots.map((x, i) => ({ id: x.json.id, done: x.json.done, notes: (details[i] && details[i].json && details[i].json.description) || '', titleRef: x.json.ref }))",
    refcheck: "  if (m[1] !== t.titleRef) continue;\n", whole: "(roots.length ? roots[0].json.whole : true)",
  });
  const n = w.nodes.find((x) => x.name === "Changes to tell Ziffr");
  n.parameters.jsCode = n.parameters.jsCode.replace("const tasks = roots.map", "const roots = $('Tasks with a Ziffr ref').all();\nconst details = $input.all();\nconst tasks = roots.map");
  return w;
}

// ---- Slack: one channel, messages of our own bot, replies only from their threads ----
const SLACK_API = "https://slack.com/api";
const SLACK = { cred: ["predefined", "slackApi", "Slack account"] };
const SLACK_FIELDS = [["channel", "REPLACE-WITH-THE-CHANNEL-ID"], ["botUserId", "REPLACE-WITH-THE-BOT-USER-ID"]];
function slackFrom() {
  const c = SLACK.cred;
  const w = new WF("slack-from", "Ziffr to Slack");
  w.note("Ziffr to Slack\n\n1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, the Slack channel id and your Slack app's bot user id (Slack: auth.test).\n2. Add the Slack credential (the bot token) to the HTTP Request nodes. The bot must be a member of the channel.\n3. Replace the Webhook path with a long random string, activate the workflow and put its production URL into the Webhook in Ziffr (events: action.created, action.done, alert.fired).\n\n" + SELF_HOSTED + " Details: docs/automations/slack.md", 340);
  w.copy(BASE.hook, 0, 300); w.settings([...BASE_FIELDS, ...SLACK_FIELDS], 220, 300);
  w.code("Verify and filter", code("slack-verify"), 440, 300);
  w.copy(BASE.answer, 660, 300);
  const sw = clone(BASE.switch);
  const vals = sw.parameters.rules.values;
  const alert = clone(vals[1]);
  vals[1].conditions.conditions[0].rightValue = "done"; vals[1].outputKey = "done";
  alert.conditions.conditions[0].id = nid("slack-from", "swalert"); alert.conditions.conditions[0].rightValue = "alert"; alert.outputKey = "alert";
  vals.push(alert);
  w.copy(sw, 880, 300);
  w.http("Read channel", "GET", `${SLACK_API}/conversations.history`, c, 1100, 160, { query: [["channel", "={{ $('Settings').first().json.channel }}"], ["limit", "100"]] });
  w.code("Find by ref", code("slack-find"), 1320, 160);
  w.copy(BASE.if, 1540, 160);
  w.http("Post message", "POST", `${SLACK_API}/chat.postMessage`, c, 1760, 260, { body: "={{ JSON.stringify($('Verify and filter').first().json.messageBody) }}" });
  w.code("Prepare link", code("slack-prepare"), 1980, 160);
  w.http("Say done in thread", "POST", `${SLACK_API}/chat.postMessage`, c, 1100, 380, { body: "={{ JSON.stringify($json.doneBody) }}" });
  w.http("Tick message", "POST", `${SLACK_API}/reactions.add`, c, 1320, 380, { body: "={{ JSON.stringify($('Verify and filter').first().json.tickBody) }}" });
  w.http("Post alert", "POST", `${SLACK_API}/chat.postMessage`, c, 1100, 540, { body: "={{ JSON.stringify($json.alertBody) }}" });
  w.copy(BASE.signFrom, 2200, 160); w.copy(BASE.callFrom, 2420, 160);
  for (const [a, b, o] of [["Ziffr event", "Settings", 0], ["Settings", "Verify and filter", 0], ["Verify and filter", "Answer Ziffr", 0], ["Answer Ziffr", "What to do", 0], ["What to do", "Read channel", 0], ["What to do", "Say done in thread", 1], ["What to do", "Post alert", 2], ["Say done in thread", "Tick message", 0], ["Read channel", "Find by ref", 0], ["Find by ref", "Already there?", 0], ["Already there?", "Prepare link", 0], ["Already there?", "Post message", 1], ["Post message", "Prepare link", 0], ["Prepare link", "Sign request", 0], ["Sign request", "Call Ziffr", 0]]) w.link(a, b, o);
  return w;
}
function slackTo() {
  const c = SLACK.cred;
  const w = new WF("slack-to", "Slack to Ziffr");
  w.note("Slack to Ziffr\n\n1. Fill in the Settings node: your Ziffr address, the Webhook's id and secret, the Slack channel id, the bot user id and who may answer (Slack user ids, comma separated, or ANYONE).\n2. Add the Slack credential (the bot token; scopes channels:history, groups:history for a private channel, reactions:read) to the Read channel and Read thread nodes.\n3. Activate the workflow. Every 5 minutes it looks at the newest tasks the bot posted: a :white_check_mark: reaction marks the Task done, and replies in a message's thread become messages in the Thread.\n\n" + SELF_HOSTED + " Details: docs/automations/slack.md", 340);
  w.add("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } }, 0, 300, 1.2);
  w.settings([...BASE_FIELDS, ...SLACK_FIELDS, ["allowedUsers", "REPLACE-WITH-THE-SLACK-USER-IDS-WHO-MAY-ANSWER"]], 220, 300);
  w.http("Read channel", "GET", `${SLACK_API}/conversations.history`, c, 440, 300, { query: [["channel", "={{ $('Settings').first().json.channel }}"], ["limit", "100"]] });
  w.code("Our messages", code("slack-ours"), 660, 300);
  w.http("Read thread", "GET", `${SLACK_API}/conversations.replies`, c, 880, 300, { query: [["channel", "={{ $json.channel }}"], ["ts", "={{ $json.ts }}"], ["limit", "100"]] });
  w.code("Changes to tell Ziffr", code("slack-changes"), 1100, 300);
  w.copy(BASE.signTo, 1320, 300).parameters.jsCode = code("slack-sign");
  w.copy(BASE.callTo, 1540, 300).onError = "continueRegularOutput";
  w.code("Remember what Ziffr took", code("slack-remember"), 1760, 300);
  for (const [a, b] of [["Every 5 minutes", "Settings"], ["Settings", "Read channel"], ["Read channel", "Our messages"], ["Our messages", "Read thread"], ["Read thread", "Changes to tell Ziffr"], ["Changes to tell Ziffr", "Sign request"], ["Sign request", "Call Ziffr"], ["Call Ziffr", "Remember what Ziffr took"]]) w.link(a, b);
  return w;
}

/** Every template: file name to the exact text that belongs in docs/automations. */
// ---- Feed templates (spec 0043): another system's figures into Ziffr through a Feed ----
// Every one reads a few figures on a schedule, shapes them into { metric, period?, value } items (feed-shape.js), sends them
// to the Feed endpoint with the Feed Key in an n8n credential, and fails the run when Ziffr refuses an item (feed-answers.js).
const FEED_CRED = ["generic", "httpHeaderAuth", "Ziffr Feed Key"];
const FEED_BASE = "={{ $('Settings').first().json.ziffrUrl.replace(/\\/+$/, '') }}/api/v1/feed";
const FEED_URL = `${FEED_BASE}/observations`;
const SHEETS = {
  key: "google-sheets", id: "google-sheets", system: "sheets", label: "Google Sheets", file: "google-sheets-feed.json", guide: "google-sheets-feed.md",
  reads: "The rows of one sheet: a column metric (the Metric's slug), a column value, and optionally a column period (the period's first day).",
  needs: "A Google account that can read the sheet.",
  rows: true,
};
const DAILY = { name: "Every day at 9", rule: { interval: [{ triggerAtHour: 9 }] }, when: "every day at 9" };
// Figures that are a month's total are sent once a month, for the month that has just ended: one value a period, never two.
const MONTHLY = { name: "On the 1st at 9", rule: { interval: [{ field: "months", triggerAtDayOfMonth: 1, triggerAtHour: 9 }] }, when: "on the 1st of every month at 9, for the month that has just ended" };
/** The node every Feed template shares (feed-finish.js): checks the rows, leaves out what is filled, makes the key. */
const finishFor = (system) => fill(code("feed-finish"), { SYSTEM: system });
/** What the source nodes of the figure-making kind share: the Settings' slugs and the month that has just ended. */
const withSettings = (name) => fill(code(name), { SETTINGS: code("feed-settings").trimEnd() });
/** `reads` adds the read nodes (in order) and returns their names; `figures` is the code of the one node about the source,
 * which hands plain rows { metric, value, period? } to "Shape values", the shared node that checks and sends them. */
function feedFlow(s, reads) {
  const when = s.schedule ?? DAILY;
  const w = new WF(`${s.key}-feed`, `${s.label} to Ziffr (values)`);
  w.note(`${s.label} to Ziffr: values\n\n1. Fill in the Settings node: your Ziffr address and ${s.fillIn ?? "where the figures are"}.\n2. Add the credentials: ${s.label} on the read node${s.readNames?.length > 1 ? "s" : ""}, and a Header Auth credential named "Ziffr Feed Key" (name Authorization, value Bearer <your Feed Key>) on Send to Ziffr. Make the key in Ziffr under Settings, Feeds, and add the Feed under Who submits on each Metric.\n3. Press Execute workflow once to try it, then activate it: it runs ${when.when} (UTC).\n\n${s.reads}${s.extraNote ? `\n\n${s.extraNote}` : ""}`, s.extraNote ? 420 : 340);
  w.add(when.name, "n8n-nodes-base.scheduleTrigger", { rule: when.rule }, 0, 300, 1.2);
  w.timezone = "UTC"; // "at 9" and "the month that has just ended" are both read in UTC, whatever zone the n8n server is set to
  w.settings(s.settings, 220, 300);
  w.http("What is filled", "GET", FEED_BASE, FEED_CRED, 440, 300, { query: [["limit", "200"]] });
  const names = reads(w, 660, 300);
  const x = 660 + 220 * names.length;
  w.code("Figures", s.figures, x, 300);
  w.code("Shape values", finishFor(s.system), x + 220, 300);
  w.http("Send to Ziffr", "POST", FEED_URL, FEED_CRED, x + 440, 300, { headers: [["Idempotency-Key", "={{ $json.key }}"]], body: "={{ JSON.stringify({ items: $json.items }) }}" });
  w.code("Check the answers", code("feed-answers"), x + 660, 300);
  const chain = [when.name, "Settings", "What is filled", ...names, "Figures", "Shape values", "Send to Ziffr", "Check the answers"];
  for (let i = 0; i + 1 < chain.length; i++) w.link(chain[i], chain[i + 1]);
  return w;
}
const sheetsFeed = () => feedFlow({ ...SHEETS, figures: fill(code("sheets-figures"), { LABEL: SHEETS.label }), settings: [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"], ["spreadsheetId", "REPLACE-WITH-THE-SPREADSHEET-ID"], ["sheetName", "REPLACE-WITH-THE-SHEET-NAME"]], fillIn: "where the figures are", readNames: ["Read the sheet"] }, (w, x, y) => {
  w.add("Read the sheet", "n8n-nodes-base.googleSheets", {
    resource: "sheet", operation: "read",
    documentId: { __rl: true, value: "={{ $('Settings').first().json.spreadsheetId }}", mode: "id" },
    sheetName: { __rl: true, value: "={{ $('Settings').first().json.sheetName }}", mode: "name" },
    options: {},
  }, x, y, 4.5, { credentials: { googleSheetsOAuth2Api: { name: "Google Sheets account" } } });
  return ["Read the sheet"];
});

const EXCEL = {
  key: "excel", id: "excel", system: "excel", label: "Microsoft Excel", file: "excel-feed.json", guide: "excel-feed.md",
  reads: "The rows of one Excel table in a workbook on OneDrive or SharePoint: a column metric (the Metric's slug), a column value, and optionally a column period (the period's first day, a date cell).",
  needs: "A Microsoft account that can read the workbook, and an app registration for n8n.",
  rows: true,
};
const excelFeed = () => feedFlow({ ...EXCEL, figures: fill(code("excel-figures"), { LABEL: EXCEL.label }), settings: [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"], ["workbookId", "REPLACE-WITH-THE-WORKBOOK-ID"], ["sheetName", "REPLACE-WITH-THE-SHEET-NAME"], ["tableName", "REPLACE-WITH-THE-TABLE-NAME"]], fillIn: "where the figures are (the workbook, its sheet and the table)", readNames: ["Read the table"] }, (w, x, y) => {
  w.add("Read the table", "n8n-nodes-base.microsoftExcel", {
    resource: "table", operation: "getRows",
    workbook: { __rl: true, value: "={{ $('Settings').first().json.workbookId }}", mode: "id" },
    worksheet: { __rl: true, value: "={{ $('Settings').first().json.sheetName }}", mode: "id" },
    table: { __rl: true, value: "={{ $('Settings').first().json.tableName }}", mode: "id" },
    returnAll: true,
    options: {},
  }, x, y, 2.2, { credentials: { microsoftExcelOAuth2Api: { name: "Microsoft Excel account" } } });
  return ["Read the table"];
});

const STRIPE = {
  key: "stripe", id: "stripe", system: "stripe", label: "Stripe", file: "stripe-feed.json", guide: "stripe-feed.md",
  reads: "Your subscriptions, read only: monthly recurring revenue, customers with a subscription and customers who cancelled, for the month that has just ended.",
  needs: "A Stripe restricted key that can read subscriptions and nothing else.",
};
/** A Stripe list read through every page (up to 50 of 100); a list that goes on after that fails the run in the shaping node. */
const stripeList = (w, name, status, x, y) => w.http(name, "GET", "https://api.stripe.com/v1/subscriptions", ["predefined", "stripeApi", "Stripe account"], x, y, { query: [["limit", "100"], ...(status ? [["status", status]] : [])] });
const stripeFeed = () => feedFlow({
  ...STRIPE, fillIn: "which Metric each figure is for, and the currency",
  settings: [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"], ["mrrMetric", "REPLACE-WITH-THE-MRR-METRIC-SLUG-OR-EMPTY"], ["customersMetric", "REPLACE-WITH-THE-CUSTOMERS-METRIC-SLUG-OR-EMPTY"], ["churnedMetric", "REPLACE-WITH-THE-CHURNED-CUSTOMERS-METRIC-SLUG-OR-EMPTY"], ["currency", "REPLACE-WITH-THE-CURRENCY-CODE-SUCH-AS-eur"]],
  schedule: MONTHLY, readNames: ["Read current subscriptions", "Read cancelled subscriptions"],
  figures: withSettings("stripe-figures"),
}, (w, x, y) => {
  const paged = (n) => { n.parameters.options = { pagination: { pagination: { paginationMode: "updateAParameterInEachRequest", parameters: { parameters: [{ type: "qs", name: "starting_after", value: "={{ $response.body.data[$response.body.data.length - 1].id }}" }] }, paginationCompleteWhen: "other", completeExpression: "={{ !$response.body.has_more }}", limitPagesFetched: true, maxRequests: 50 } } }; };
  paged(stripeList(w, "Read current subscriptions", null, x, y));
  const cancelled = stripeList(w, "Read cancelled subscriptions", "canceled", x + 220, y);
  paged(cancelled);
  cancelled.executeOnce = true; // the first read hands over one item a page; this one is asked once, not once a page
  return ["Read current subscriptions", "Read cancelled subscriptions"];
});

const HUBSPOT = {
  key: "hubspot", id: "hubspot", system: "hubspot", label: "HubSpot", file: "hubspot-feed.json", guide: "hubspot-feed.md",
  reads: "Two counts, read only: deals won and new contacts, for the month that has just ended.",
  needs: "A HubSpot private app token with read access to deals and contacts.",
};
// The month that has just ended, as milliseconds since 1970 (what HubSpot's search takes): from its first day up to the next month's.
const MONTH_FROM = "new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).getTime()";
const MONTH_TO = "new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).getTime()";
const hubspotCount = (w, name, object, filters, x, y) => w.http(name, "POST", `https://api.hubapi.com/crm/v3/objects/${object}/search`, ["predefined", "hubspotAppToken", "HubSpot App Token"], x, y, {
  body: `={{ JSON.stringify({ filterGroups: [{ filters: [${filters}] }], properties: ['hs_object_id'], limit: 1 }) }}`,
});
const hubspotFeed = () => feedFlow({
  ...HUBSPOT, fillIn: "which Metric each figure is for",
  settings: [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"], ["dealsWonMetric", "REPLACE-WITH-THE-DEALS-WON-METRIC-SLUG-OR-EMPTY"], ["newContactsMetric", "REPLACE-WITH-THE-NEW-CONTACTS-METRIC-SLUG-OR-EMPTY"]],
  schedule: MONTHLY, readNames: ["Count deals won", "Count new contacts"],
  figures: withSettings("hubspot-figures"),
}, (w, x, y) => {
  const range = (prop) => `{ propertyName: '${prop}', operator: 'GTE', value: String(${MONTH_FROM}) }, { propertyName: '${prop}', operator: 'LT', value: String(${MONTH_TO}) }`;
  hubspotCount(w, "Count deals won", "deals", `{ propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' }, ${range("closedate")}`, x, y);
  hubspotCount(w, "Count new contacts", "contacts", range("createdate"), x + 220, y);
  return ["Count deals won", "Count new contacts"];
});
// ---- Warehouses (spec 0048): one query on a schedule through n8n's own node, the rows it returns are the figures ----
// The month that has just ended, read in UTC (the flow runs in UTC): its first day and the next month's, as n8n expressions
// that stand where a query writes :period_start and :period_end. They are made by this template, never taken from data.
const PERIOD_START = "{{ $now.minus({ months: 1 }).startOf('month').toFormat('yyyy-MM-dd') }}";
const PERIOD_END = "{{ $now.startOf('month').toFormat('yyyy-MM-dd') }}";
const WAREHOUSE_NOTE = "Edit the query in the node \"Your query\": it must return one row per figure with the columns metric (the Metric's slug), value (a number) and period (the first day of the month). The first date in the example query is :period_start and the second :period_end: leave them as they are, they are the month that has just ended.";
const BIGQUERY = {
  key: "bigquery", id: "bigquery", system: "bigquery", label: "BigQuery", file: "bigquery-feed.json", guide: "bigquery-feed.md",
  reads: "The rows of a query you write in BigQuery, read only: each row has a metric (the Metric's slug), a value and the period's first day. Runs once a month, for the month that has just ended.",
  fillIn: "the Google Cloud project id and the tables in Your query (the query names the Metrics)",
  needs: "A Google Cloud project and a service account (or login) that may run queries and read the tables the query names, and nothing more.",
};
const SNOWFLAKE = {
  key: "snowflake", id: "snowflake", system: "snowflake", label: "Snowflake", file: "snowflake-feed.json", guide: "snowflake-feed.md",
  reads: "The rows of a query you write in Snowflake, read only: each row has a metric (the Metric's slug), a value and the period's first day. Runs once a month, for the month that has just ended.",
  fillIn: "the tables in Your query (the query names the Metrics)",
  needs: "A Snowflake user with a role that may run queries on a warehouse and read the tables the query names, and nothing more.",
};
const BQ_QUERY = `-- EDIT THIS QUERY. One row per figure: metric (the Metric's slug), value (a number), period (the month's first day).
-- Add more Metrics with UNION ALL. Keep the dates as they are: they are the month that has just ended.
SELECT 'revenue' AS metric, CAST(SUM(amount) AS NUMERIC) AS value, DATE '${PERIOD_START}' AS period
FROM \`my-project.my_dataset.orders\`
WHERE created_at >= TIMESTAMP '${PERIOD_START}' AND created_at < TIMESTAMP '${PERIOD_END}'
UNION ALL
SELECT 'new-customers', COUNT(*), DATE '${PERIOD_START}'
FROM \`my-project.my_dataset.customers\`
WHERE created_at >= TIMESTAMP '${PERIOD_START}' AND created_at < TIMESTAMP '${PERIOD_END}'`;
const SF_QUERY = `-- EDIT THIS QUERY. One row per figure: metric (the Metric's slug), value (a number), period (the month's first day).
-- Add more Metrics with UNION ALL. Keep the dates as they are: they are the month that has just ended.
SELECT 'revenue' AS metric, SUM(amount)::NUMBER(18,2) AS value, DATE '${PERIOD_START}' AS period
FROM my_db.my_schema.orders
WHERE created_at >= '${PERIOD_START}' AND created_at < '${PERIOD_END}'
UNION ALL
SELECT 'new-customers', COUNT(*), DATE '${PERIOD_START}'
FROM my_db.my_schema.customers
WHERE created_at >= '${PERIOD_START}' AND created_at < '${PERIOD_END}'`;
const warehouseFeed = (s, readType, version, params, cred) => feedFlow({
  ...s, figures: fill(code("warehouse-figures"), { LABEL: s.label }), schedule: MONTHLY,
  settings: [["ziffrUrl", "https://REPLACE-WITH-YOUR-ZIFFR-ADDRESS"]],
  fillIn: s.fillIn, readNames: ["Your query"], extraNote: WAREHOUSE_NOTE,
}, (w, x, y) => {
  // alwaysOutputData: an empty answer still reaches the check, which fails the run in words instead of ending it quietly.
  w.add("Your query", readType, params, x, y, version, { credentials: cred, alwaysOutputData: true });
  return ["Your query"];
});
const bigqueryFeed = () => warehouseFeed(BIGQUERY, "n8n-nodes-base.googleBigQuery", 2.1, {
  resource: "database", operation: "executeQuery",
  projectId: { __rl: true, value: "REPLACE-WITH-YOUR-PROJECT-ID", mode: "id" },
  sqlQuery: "=" + BQ_QUERY, options: {},
}, { googleBigQueryOAuth2Api: { name: "Google BigQuery account" } });
const snowflakeFeed = () => warehouseFeed(SNOWFLAKE, "n8n-nodes-base.snowflake", 1, {
  operation: "executeQuery", query: "=" + SF_QUERY,
}, { snowflake: { name: "Snowflake account" } });
const FEED_TEMPLATES = [SHEETS, EXCEL, STRIPE, HUBSPOT, BIGQUERY, SNOWFLAKE];

export function generate() {
  const [todo, google, asana] = SYSTEMS_LIST;
  const all = {
    "microsoft-todo-from-ziffr.json": listFrom(todo), "microsoft-todo-to-ziffr.json": listTo(todo),
    "google-tasks-from-ziffr.json": listFrom(google), "google-tasks-to-ziffr.json": listTo(google),
    "asana-from-ziffr.json": asanaFrom(asana), "asana-to-ziffr.json": listTo(asana),
    "todoist-from-ziffr.json": todoistFrom(), "todoist-to-ziffr.json": todoistTo(),
    "planner-from-ziffr.json": plannerFrom(), "planner-to-ziffr.json": plannerTo(),
    "slack-from-ziffr.json": slackFrom(), "slack-to-ziffr.json": slackTo(),
  };
  const feeds = { "google-sheets-feed.json": sheetsFeed(), "excel-feed.json": excelFeed(), "stripe-feed.json": stripeFeed(), "hubspot-feed.json": hubspotFeed(), "bigquery-feed.json": bigqueryFeed(), "snowflake-feed.json": snowflakeFeed() };
  const index = { templates: FEED_TEMPLATES.map(({ id, label, file, guide, reads, needs, rows }) => ({ id, label, file, guide, reads, needs, ...(rows ? { rows } : {}) })) };
  return {
    ...Object.fromEntries(Object.entries({ ...all, ...feeds }).map(([f, w]) => [f, JSON.stringify(w.file(), null, 2) + "\n"])),
    "feed-templates.json": JSON.stringify(index, null, 2) + "\n",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL("../../docs/automations/", import.meta.url);
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const [file, text] of Object.entries(generate())) {
    let have = "";
    try { have = readFileSync(new URL(file, dir), "utf8"); } catch { /* missing */ }
    if (have === text) continue;
    if (check) { console.error(`docs/automations/${file} differs from the generator's output`); bad++; } else writeFileSync(new URL(file, dir), text);
  }
  if (bad) { console.error("Run: node scripts/automation-templates/generate.mjs"); process.exit(1); }
}
