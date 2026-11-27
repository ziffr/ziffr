// After a Pack's set-up: "Change who approves" (spec 0068, #1345; GLOSSARY: Pack, Position, Repeat, Approver, Share,
// Stand-in, Snapshot, Workflow). A Member takes a Position's places among what the set-up made: the Approve step, the
// proposed Shares, the Stand-in and who gets the Snapshot. The person first sees each change; only that is then made.
// Security: only Owners and Admins, and only changes to things they own: each goes through the operation used by hand
// (saveWorkflow, setStandIn, share), which checks it again; what is someone else's is only named as left to do. The new
// holder is a Member of this Workspace, never a Guest or a Contact, and no Workspace Role changes. Shares are offered
// only where the Pack proposes them, ticked by default only where they show nothing more, and none is taken away. The
// record of the Set up says where to look and grants nothing. A browser names ids and keys, all matched against what is
// worked out here.
import { Forbidden, Refused, type Actor } from "./actor";
import { getShares } from "./access";
import { db } from "./db";
import { assertStillOpen, packAfter, type AfterMetric, type PackAfter } from "./pack-after";
import { listed, type PlacedStep } from "./pack-places";
import { placeMaps, setupPeople } from "./pack-setup-build";
import { noteHolder, recordedHolders, type MadeThing, type RecordedHolder } from "./pack-setup-record";
import { itemHash } from "./packs";
import { share } from "./sharing";
import { TELL_PEOPLE_PER_STEP } from "./alert-limits";
import type { ShareRole, WorkflowConfig, WorkflowTemplateBody } from "./types";
import { openWorkflowRows } from "./workflow-rows";
import { saveWorkflow, setStandIn } from "./workflows";

/** A Position that approves among what the person may change, of one line where its Repeat has several. */
export type PackHolderPosition = {
  position: string;
  name: string;
  line: string | null;
  /** Who holds it by the record, in words; "You" for the person asking. */
  holders: string[];
  /** Someone the person holds it for until they have joined. */
  heldFor: string | null;
};

/** Who may be changed, and who may take a Position: the Members. */
export type PackHolders = { pack: string; positions: PackHolderPosition[]; members: { id: string; name: string; you: boolean }[] };

/** A change as chosen. */
export type PackHolderPick = { position: string; line: string | null; person: string };

/** What the change would do, to be read before it is made. `mark` names exactly this plan. */
export type PackHolderPlan = {
  changes: string[];
  shares: { id: string; words: string; showsMore: boolean; suggested: boolean }[];
  /** What this person cannot or this does not change, each with where to do it. */
  byHand: string[];
  notes: string[];
  /** Why nothing can be changed; null when it can. */
  problem: string | null;
  mark: string;
};

type Flow = { id: number; key: string; line: MadeThing["line"]; name: string; mine: boolean; config: WorkflowConfig };
type Places = ReturnType<typeof placeMaps>;
type Line = MadeThing["line"];

const sameLine = (a: Line, b: Line) => a?.repeat === b?.repeat && a?.name === b?.name;

async function flowsOf(actor: Actor, a: PackAfter): Promise<Flow[]> {
  const made = a.made.filter((m) => m.kind === "workflow");
  if (!made.length) return [];
  const { data, error } = await db().from("workflows").select("id, name, owner_id, config").eq("workspace_id", actor.workspaceId).in("id", made.map((m) => m.id));
  if (error) throw new Error("The Workflows could not be read.");
  const rows = new Map((await openWorkflowRows(actor.workspaceId, data)).map((w) => [Number(w.id), w]));
  return made.flatMap((m): Flow[] => {
    const w = rows.get(m.id);
    return w ? [{ id: m.id, key: m.key, line: m.line, name: String(w.name), mine: w.owner_id === actor.personId, config: w.config as WorkflowConfig }] : [];
  });
}

// The positions that approve in a Workflow of the person's own, each of its line.
function approving(a: PackAfter, flows: Flow[]): { position: string; name: string; line: Line }[] {
  const places = a.installed.places;
  if (!places) return [];
  return places.positions.flatMap((p): { position: string; name: string; line: Line }[] => {
    const mine = flows.filter((f) => f.mine && places.workflows.find((w) => w.key === f.key)?.steps.some((s) => s.by?.includes(p.key)));
    if (!mine.length) return [];
    if (p.per === undefined) return [{ position: p.key, name: p.name, line: null }];
    const lines: NonNullable<Line>[] = [];
    for (const f of mine) if (f.line?.repeat === p.per && !lines.some((l) => sameLine(l, f.line))) lines.push(f.line);
    return lines.map((line) => ({ position: p.key, name: p.name, line }));
  });
}

/** How many Positions this person may change who approves of. */
export async function holderPositions(actor: Actor, a: PackAfter): Promise<number> {
  return approving(a, await flowsOf(actor, a)).length;
}

/** What "Change who approves" shows (Owners and Admins). Writes nothing. */
export async function packHolders(actor: Actor, installId: number): Promise<PackHolders> {
  const a = await packAfter(actor, installId);
  const [flows, holders, people] = await Promise.all([flowsOf(actor, a), recordedHolders(actor, a.setups), setupPeople(actor)]);
  const name = (id: string) => (id === actor.personId ? "You" : people.get(id)?.name ?? "Someone");
  return {
    pack: a.name,
    positions: approving(a, flows).map((p) => {
      const rows = holders.filter((h) => h.position === p.position && sameLine(h.line, p.line));
      const waiting = rows.find((h) => h.heldFor && people.has(h.heldFor))?.heldFor;
      return { position: p.position, name: p.name, line: p.line?.name ?? null, holders: [...new Set(rows.map((h) => name(h.person)))], heldFor: waiting ? name(waiting) : null };
    }),
    members: [...people.values()].filter((p) => p.kind === "member").map((p) => ({ id: p.id, name: p.name, you: p.id === actor.personId })),
  };
}

// ---- The plan ----

type Op =
  | { kind: "approve"; flow: number; from: string }
  | { kind: "snapshot"; flow: number; people: string[] }
  | { kind: "standIn"; metric: number; submitter: string };
type ShareOffer = { id: string; object: "metric" | "dashboard"; objectId: number; role: ShareRole; words: string; showsMore: boolean; suggested: boolean };

type Planning = {
  actor: Actor;
  a: PackAfter;
  places: Places;
  flows: Flow[];
  holders: RecordedHolder[];
  position: string;
  per: string | undefined;
  line: Line;
  to: string;
  /** Who holds the Position there now, by the record. */
  old: Set<string>;
  name: (id: string) => string;
  ops: Op[];
  offers: ShareOffer[];
  changes: string[];
  byHand: string[];
  notes: string[];
};

// Whether a thing made belongs to what is being changed: everything for a Position outside a Repeat, else its own line's
// and what shows every line.
const inScope = (p: Planning, line: Line) => p.per === undefined || line === null || sameLine(line, p.line);
const names = (keys: string | string[] | undefined) => (keys === undefined ? [] : [keys].flat());

// Whether someone also holds another Position a step names, and so stays in it.
const heldElsewhere = (p: Planning, person: string, keys: string[]) => p.holders.some((h) => h.person === person && h.position !== p.position && keys.includes(h.position));

function planApprove(p: Planning, f: Flow, step: PlacedStep) {
  const by = step.by!;
  const approve = f.config.steps.find((s) => s.type === "approve");
  if (!approve || approve.approvers.length !== by.length) return void p.byHand.push(`The Approvers of “${f.name}” were changed since: change them in the Workflow.`);
  const from = approve.approvers[by.indexOf(p.position)];
  // A Workflow for every line takes one line's holder: only that holder is replaced.
  if (p.per !== undefined && f.line === null && !p.old.has(from)) return;
  if (from === p.to) return;
  if (approve.approvers.includes(p.to)) return void p.byHand.push(`${p.name(p.to)} approves another place in “${f.name}” already, and an Approver is named once: change it in the Workflow.`);
  p.ops.push({ kind: "approve", flow: f.id, from });
  p.changes.push(`Approves in “${f.name}”: ${p.name(p.to)} instead of ${p.name(from)}.`);
  const own = p.a.metrics.filter((m) => m.workflowId === f.id && p.a.submitters.some((s) => s.metric === m.id && s.person === p.to));
  if (own.length) p.notes.push(`${p.name(p.to)} also sends numbers that follow “${f.name}”. Nobody approves their own value: the next Approver or the Metric Owner does, else the Approve step's Self-check or count applies.`);
}

function planSnapshot(p: Planning, f: Flow, keys: string[]) {
  const send = f.config.steps.find((s) => s.type === "send_snapshot");
  if (!send?.dashboardId) return void p.byHand.push(`The Snapshot step of “${f.name}” has no dashboard yet: pick it and its people in the Workflow.`);
  const leaving = send.people.filter((x) => x !== p.to && p.old.has(x) && !heldElsewhere(p, x, keys));
  const people = [...new Set([...send.people.filter((x) => !leaving.includes(x)), p.to])];
  if (!leaving.length && send.people.includes(p.to)) return;
  if (people.length > TELL_PEOPLE_PER_STEP) return void p.byHand.push(`The Snapshot of “${f.name}” reaches at most ${TELL_PEOPLE_PER_STEP} people: choose them in the Workflow.`);
  p.ops.push({ kind: "snapshot", flow: f.id, people });
  p.changes.push(`Gets the Snapshot of “${f.name}”: ${p.name(p.to)}${leaving.length ? `, and no longer ${listed(leaving.map(p.name))}` : ""}.`);
}

function planWorkflows(p: Planning) {
  for (const f of p.flows.filter((x) => inScope(p, x.line))) {
    const all = p.a.installed.places?.workflows.find((w) => w.key === f.key);
    const named = [...(all?.steps ?? []).flatMap((s) => [...names(s.by), ...names(s.to), ...names(s.assignee), ...names(s.standIn)]), ...(all?.tells ?? []).flatMap((t) => names(t.to))];
    if (!named.includes(p.position)) continue;
    if (!f.mine) { p.byHand.push(`“${f.name}” is someone else's Workflow: ask its owner to change it.`); continue; }
    // Places read for another version of the template are left alone.
    const placed = p.places.workflows.get(f.key);
    if (!placed) { p.byHand.push(`“${f.name}” was made from another version of the Pack: change it in the Workflow.`); continue; }
    const body = p.a.installed.workflows.get(f.key)!.body as WorkflowTemplateBody;
    let other = (placed.tells ?? []).some((t) => names(t.to).includes(p.position));
    for (const step of placed.steps) {
      if (step.by?.includes(p.position)) planApprove(p, f, step);
      const snapshot = body.steps[step.at]?.type === "send_snapshot";
      if (snapshot && step.to?.includes(p.position)) planSnapshot(p, f, step.to);
      other ||= (!snapshot && Boolean(step.to?.includes(p.position))) || step.assignee === p.position || step.standIn === p.position;
    }
    if (other) p.byHand.push(`“${f.name}” also tells this Position or gives it Tasks: change that in the Workflow.`);
  }
}

function planStandIns(p: Planning) {
  const stood: string[] = [];
  const theirs: string[] = [];
  const sends: string[] = [];
  for (const m of p.a.metrics.filter((x) => inScope(p, x.line) && p.places.metrics.get(x.key)?.standIn === p.position)) {
    for (const s of p.a.submitters.filter((x) => x.metric === m.id)) {
      if (s.person === p.to) { sends.push(m.name); continue; }
      // Someone chosen by hand stays.
      if (s.standIn === p.to || (s.standIn !== null && !p.old.has(s.standIn))) continue;
      if (!m.mine) { theirs.push(m.name); continue; }
      p.ops.push({ kind: "standIn", metric: m.id, submitter: s.person });
      stood.push(m.name);
    }
  }
  const few = (list: string[]) => { const one = [...new Set(list)]; return one.length > 4 ? `${one.slice(0, 3).join(", ")} and ${one.length - 3} more` : listed(one); };
  if (stood.length) p.changes.push(`Stands in for who sends ${few(stood)}: ${p.name(p.to)}.`);
  if (theirs.length) p.byHand.push(`Ask the owner to change who stands in for ${few(theirs)}.`);
  if (sends.length) p.notes.push(`${p.name(p.to)} sends ${few(sends)}, so nobody stands in for them there.`);
}

type Shared = { object: "metric" | "dashboard"; id: number; name: string; mine: boolean; metrics: number[]; role: ShareRole; owner: string };

// The things the Pack proposes sharing with the Position, with the role: Editor wins over Viewer.
async function proposed(p: Planning): Promise<Shared[]> {
  const role = (place: { viewers?: string[]; editors?: string[] } | undefined): ShareRole | null => (place?.editors?.includes(p.position) ? "editor" : place?.viewers?.includes(p.position) ? "viewer" : null);
  const metrics = p.a.metrics.filter((m) => inScope(p, m.line)).flatMap((m: AfterMetric): Shared[] => {
    const r = role(p.places.metrics.get(m.key));
    return r ? [{ object: "metric", id: m.id, name: m.name, mine: m.mine, metrics: [m.id], role: r, owner: m.metric.owner_id }] : [];
  });
  const boards = p.a.made.filter((x) => x.kind === "dashboard" && inScope(p, x.line) && role(p.places.dashboards.get(x.key)));
  if (!boards.length) return metrics;
  const ws = p.actor.workspaceId;
  const ids = boards.map((b) => b.id);
  const [{ data: rows, error }, { data: widgets, error: unread }] = await Promise.all([
    db().from("dashboards").select("id, name, owner_id").eq("workspace_id", ws).in("id", ids),
    db().from("widgets").select("dashboard_id, metric_ids").eq("workspace_id", ws).in("dashboard_id", ids),
  ]);
  if (error || unread) throw new Error("The dashboards could not be read.");
  // Only the person's own are named: another's dashboard is theirs to share.
  return [...metrics, ...boards.flatMap((b): Shared[] => {
    const row = (rows ?? []).find((r) => Number(r.id) === b.id);
    if (!row || row.owner_id !== p.actor.personId) return [];
    const shown = (widgets ?? []).filter((w) => Number(w.dashboard_id) === b.id).flatMap((w) => (w.metric_ids as number[] | null) ?? []);
    return [{ object: "dashboard", id: b.id, name: String(row.name), mine: true, metrics: shown, role: role(p.places.dashboards.get(b.key))!, owner: String(row.owner_id) }];
  })];
}

async function planShares(p: Planning) {
  const shares = await getShares(p.actor.workspaceId);
  const has = (person: string, s: Shared) => shares.filter((x) => x.user_id === person && x.object_type === s.object && x.object_id === s.id).map((x) => x.role);
  const theirs: string[] = [];
  const keeping = new Set<string>();
  for (const s of await proposed(p)) {
    for (const old of p.old) if (old !== p.to && old !== s.owner && has(old, s).length) keeping.add(old);
    const now = has(p.to, s);
    if (s.owner === p.to || now.includes("editor") || (s.role === "viewer" && now.length)) continue;
    if (!s.mine) { theirs.push(s.name); continue; }
    const showsMore = s.metrics.some((m) => !p.a.submitters.some((x) => x.metric === m && x.person === p.to));
    p.offers.push({ id: `${s.object} ${s.id} ${s.role}`, object: s.object, objectId: s.id, role: s.role, words: `${p.name(p.to)} can ${s.role === "editor" ? "edit" : "see"} the ${s.object === "metric" ? "Metric" : "dashboard"} “${s.name}”`, showsMore, suggested: s.role === "viewer" && !showsMore });
  }
  if (theirs.length) p.byHand.push(`Ask the owner to share ${theirs.length === 1 ? `“${theirs[0]}”` : `${theirs.length} Metrics`}.`);
  if (keeping.size) p.byHand.push(`${listed([...keeping].map(p.name))} keeps what is shared with them. Take it away under “Who can see this”.`);
}

async function planFor(actor: Actor, a: PackAfter, pick: PackHolderPick): Promise<Planning> {
  const [flows, holders, people] = await Promise.all([flowsOf(actor, a), recordedHolders(actor, a.setups), setupPeople(actor)]);
  const found = approving(a, flows).find((x) => x.position === pick?.position && (x.line?.name ?? null) === (pick.line ?? null));
  if (!found) throw new Forbidden("Pick a Position of this set-up. Reload this page.");
  if (typeof pick.person !== "string" || people.get(pick.person)?.kind !== "member") throw new Forbidden("Pick a Member of this Workspace.");
  const places = placeMaps(a.installed.places, a.installed.workflows);
  const p: Planning = {
    actor, a, places, flows, holders, position: found.position, per: places.positions.get(found.position)?.per, line: found.line, to: pick.person,
    old: new Set(holders.filter((h) => h.position === found.position && sameLine(h.line, found.line)).map((h) => h.person)),
    name: (id) => (id === actor.personId ? "You" : people.get(id)?.name ?? "Someone"),
    ops: [], offers: [], changes: [], byHand: [], notes: [],
  };
  planWorkflows(p);
  planStandIns(p);
  await planShares(p);
  if (a.installed.places?.metrics.some((m) => m.submitters?.includes(found.position))) p.byHand.push("Who sends the numbers stays as it is: change it on each Metric's page.");
  return p;
}

function shownPlan(p: Planning): PackHolderPlan {
  const nothing = !p.ops.length && !p.offers.length;
  return {
    changes: p.changes,
    shares: p.offers.map(({ id, words, showsMore, suggested }) => ({ id, words, showsMore, suggested })),
    byHand: [...new Set(p.byHand)], notes: [...new Set(p.notes)],
    problem: nothing ? `Nothing here would change for ${p.name(p.to)}.` : null,
    mark: itemHash({ position: p.position, line: p.line?.name ?? null, to: p.to, ops: p.ops, shares: p.offers.map((o) => o.id) }),
  };
}

/** What putting a Member into a Position would change (Owners and Admins). Writes nothing. */
export async function packHolderPlan(actor: Actor, installId: number, pick: PackHolderPick): Promise<PackHolderPlan> {
  return shownPlan(await planFor(actor, await packAfter(actor, installId), pick));
}

/** One save of a Workflow with its new Approver and Snapshot people, all else as stored. */
async function saveFlow(p: Planning, f: Flow, ops: Op[]) {
  const steps = f.config.steps.map((s) => {
    for (const op of ops) {
      if (op.kind === "approve" && s.type === "approve") return { ...s, approvers: s.approvers.map((x) => (x === op.from ? p.to : x)) };
      if (op.kind === "snapshot" && s.type === "send_snapshot") return { ...s, people: op.people };
    }
    return s;
  });
  await saveWorkflow(p.actor, f.id, f.name, { ...f.config, steps }, { message: "Changed who approves, from the Pack's set-up", keepWebhooks: true });
}

/** Puts a Member into a Position's places, as `packHolderPlan` showed it: refused when anything differs since (`mark`).
 * Of the Shares only those ticked are made. */
export async function changePackHolder(actor: Actor, installId: number, input: PackHolderPick & { shares?: unknown; mark?: unknown }): Promise<{ changed: string[]; byHand: string[] }> {
  const a = await packAfter(actor, installId);
  await assertStillOpen(actor);
  const p = await planFor(actor, a, input);
  const plan = shownPlan(p);
  if (plan.mark !== input.mark) throw new Refused("Something changed since you looked. Check the changes again.");
  if (plan.problem) throw new Refused(plan.problem);
  const ticked = new Set(Array.isArray(input.shares) ? input.shares.slice(0, 1000).map(String) : []);
  const shares = p.offers.filter((o) => ticked.has(o.id));
  for (const f of p.flows) {
    const ops = p.ops.filter((o) => o.kind !== "standIn" && o.flow === f.id);
    if (ops.length) await saveFlow(p, f, ops);
  }
  for (const op of p.ops) if (op.kind === "standIn") await setStandIn(actor, op.metric, op.submitter, p.to);
  for (const s of shares) await share(actor, s.object, s.objectId, p.to, s.role);
  if (p.ops.length || shares.length) await noteHolder(actor, a.setups, p.position, p.line, p.to);
  return { changed: [...p.changes, ...shares.map((s) => `${s.words}.`)], byHand: plan.byHand };
}
