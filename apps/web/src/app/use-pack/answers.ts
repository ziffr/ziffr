// The answers of a guided Pack set-up as they are typed (spec 0068; GLOSSARY: Pack, Position, Repeat, Contact): their
// start, the choices they send, why a screen cannot go on yet, and who may be picked. Pure, so the screens and "Try it"
// share it. It decides nothing: the plan (pack-start-plan) and the server check every answer again.
import { readNumber } from "@ziffr/core/numbers";
import type { NumberStyle } from "@ziffr/core/number-style";
import { whyNot, type Place } from "@ziffr/core/pack-setup-who";
import type { StartPickable } from "@ziffr/core/pack-start-plan";
import { defaultChoices, START_PROVIDERS_MAX, type StartAsked, type StartChoices, type StartLimit, type StartPerson, type StartRoom, type StartStep } from "@ziffr/core/pack-start-steps";

/** A person as typed: me, someone picked from those here, or someone new. What was typed stays when the kind changes. */
export type PersonDraft = { who: "me" | "here" | "new"; here: string; name: string; email: string };
/** One line of a Repeat as typed. `id` keeps its fields and numbers together when a line before it is removed. */
export type LineDraft = { id: number; name: string; person: PersonDraft; others: Record<string, PersonDraft> };
/** One of the "Other people" who provide numbers. */
export type ProviderDraft = PersonDraft & { id: number };
/** Who provides the numbers no Position submits. */
export type ProvidersDraft = { me: boolean; others: boolean; nobody: boolean; people: ProviderDraft[] };

/** Everything typed in the flow. */
export type Answers = {
  lines: Record<string, LineDraft[]>;
  who: Record<string, PersonDraft>;
  providers: ProvidersDraft;
  /** The numbers as typed, by `numberKey`. */
  numbers: Record<string, string>;
  /** "Add later": no number is written. */
  later: boolean;
  source: "typed" | "system";
  /** The proposed Shares the person ticked or unticked; the others stay as proposed. */
  shares: Record<string, boolean>;
  /** The words aimed at assistants were read. */
  confirmed: boolean;
  /** The next id of a line or a provider. */
  next: number;
};

export type LinesStep = Extract<StartStep, { step: "lines" }>;

const NOBODY: PersonDraft = { who: "new", here: "", name: "", email: "" };

/** An empty answer for one person: someone new, or, where no new people may be added, one to pick. */
export const emptyPerson = (room: Pick<StartRoom, "practice">): PersonDraft => ({ ...NOBODY, who: room.practice ? "here" : "new" });
/** "I do". */
export const meDraft = (): PersonDraft => ({ ...NOBODY, who: "me" });

/** One more empty line of a Repeat. Its further people start as "I do", like every question that fills a Position. */
export function emptyLine(step: LinesStep, room: Pick<StartRoom, "practice">, id: number): LineDraft {
  return { id, name: "", person: emptyPerson(room), others: Object.fromEntries(step.others.map((o) => [o.position, meDraft()])) };
}

/** What the screens start with: what each step preselects, and one empty line for each Repeat. */
export function startAnswers(steps: StartStep[], room: StartRoom): Answers {
  const chosen = defaultChoices(steps);
  let next = 1;
  const lines: Answers["lines"] = {};
  const who: Answers["who"] = {};
  for (const s of steps) {
    if (s.step === "lines") lines[s.repeat] = s.limit.allowed > 0 ? [emptyLine(s, room, next++)] : [];
    if (s.step === "who") who[s.position] = meDraft();
  }
  const mine = Boolean(chosen.providers?.length);
  return {
    lines, who,
    providers: { me: mine, others: false, nobody: !mine, people: [] },
    numbers: {}, later: false, source: chosen.source ?? "typed", shares: {}, confirmed: false, next,
  };
}

/** Whether nothing was said about this person yet. */
const blankPerson = (p: PersonDraft) => (p.who === "new" ? !p.name.trim() && !p.email.trim() : p.who === "here" ? !p.here : false);

/** Whether a line holds nothing: such a line is not sent. */
function blankLine(step: LinesStep, line: LineDraft): boolean {
  const named = step.asksName && line.name.trim() !== "";
  const person = step.person !== null && !blankPerson(line.person);
  const others = step.others.some((o) => { const p = line.others[o.position]; return p !== undefined && p.who !== "me" && !blankPerson(p); });
  return !named && !person && !others;
}

/** The lines of a Repeat that are sent, in their order: the server counts numbers by this order. */
export const filledLines = (step: LinesStep, answers: Answers) => (answers.lines[step.repeat] ?? []).filter((l) => !blankLine(step, l));

/** A typed person as the choices name them. */
function toPerson(p: PersonDraft): StartPerson {
  if (p.who === "me") return { who: "me" };
  if (p.who === "here") return { who: "here", id: p.here };
  return { who: "new", name: p.name.trim(), email: p.email.trim() };
}

/** The text field of one asked number: of a Metric, and of a line of its Repeat. */
export const numberKey = (metric: string, line: number | null) => `${metric}|${line ?? ""}`;

/** The choices the answers send. Shares are added from the plan (`tickedShares`). */
export function toChoices(answers: Answers, steps: StartStep[], style: NumberStyle): StartChoices {
  const choices: StartChoices = {};
  const lineSteps = steps.filter((s): s is LinesStep => s.step === "lines");
  for (const s of steps) {
    if (s.step === "lines") {
      for (const line of filledLines(s, answers)) {
        (choices.lines ??= []).push({
          repeat: s.repeat,
          ...(s.asksName ? { name: line.name.trim() } : {}),
          ...(s.person ? { person: toPerson(line.person) } : {}),
          ...(s.others.length ? { others: s.others.map((o) => ({ position: o.position, person: toPerson(line.others[o.position] ?? meDraft()) })) } : {}),
        });
      }
    }
    if (s.step === "who") (choices.who ??= []).push({ position: s.position, person: toPerson(answers.who[s.position] ?? meDraft()) });
    if (s.step === "providers") {
      const { providers } = answers;
      choices.providers = providers.nobody ? [] : [
        ...(providers.me ? [{ who: "me" as const }] : []),
        ...(providers.others ? providers.people.filter((p) => !blankPerson(p)).map(toPerson) : []),
      ];
    }
    if (s.step === "numbers" && !answers.later) {
      for (const ask of s.asks) {
        const repeat = lineSteps.find((x) => x.repeat === ask.repeat);
        const rows: (LineDraft | null)[] = ask.repeat === null ? [null] : repeat ? filledLines(repeat, answers) : [];
        rows.forEach((line, i) => {
          const value = readNumber(answers.numbers[numberKey(ask.metric, line?.id ?? null)] ?? "", style);
          if (value !== null) (choices.numbers ??= []).push({ metric: ask.metric, ...(line ? { line: i } : {}), value });
        });
      }
    }
    if (s.step === "source") choices.source = answers.source;
  }
  if (answers.confirmed) choices.confirmed = { assistantTexts: true };
  return choices;
}

/** The proposed Shares that are ticked: as proposed unless the person said otherwise. */
export const tickedShares = (shares: { id: string; suggested: boolean }[], answers: Pick<Answers, "shares">) => shares.filter((s) => answers.shares[s.id] ?? s.suggested).map((s) => s.id);

/** Those who may be picked for a Position with these places. */
export const eligible = (people: StartPickable[], places: Iterable<Place>) => {
  const set = new Set(places);
  return people.filter((p) => whyNot(p.kind, set) === null);
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is missing about one typed person, or null. `of` says whose, such as "line 2". */
function personProblem(p: PersonDraft, of: string): string | null {
  if (p.who === "me") return null;
  if (p.who === "here") return p.here ? null : `Pick a person for ${of}.`;
  const name = p.name.trim();
  const email = p.email.trim();
  if (!name) return `Add a name for ${of}.`;
  if (!email) return `Add an email address for ${name}.`;
  return EMAIL.test(email) ? null : `That email address does not look right for ${name}.`;
}

const samePerson = (p: PersonDraft) => (p.who === "me" ? "me" : p.who === "here" ? `here ${p.here}` : `new ${p.email.trim().toLowerCase()}`);

/** The places a Workspace or a Pack has for lines, in words: what bounds them and how many there are. */
export function limitWords(limit: StartLimit, trial: boolean): string {
  const n = limit.allowed;
  if (n === 0) {
    if (limit.because === "metrics") return "There is no room for more numbers here.";
    if (limit.because === "people") return "There is no place left for people in your trial.";
    return "This Pack does not fit here.";
  }
  if (trial && (limit.because === "metrics" || limit.because === "people")) return `${n} ${n === 1 ? "place" : "places"} in your trial`;
  if (limit.because === "metrics") return `Room for ${n} here`;
  if (limit.because === "setup") return `At most ${n} in one set-up`;
  return `This Pack takes at most ${n}`;
}

function linesProblem(step: LinesStep, answers: Answers): string | null {
  if (step.limit.allowed === 0) return "Nothing more fits here, so this cannot go on.";
  const lines = answers.lines[step.repeat] ?? [];
  const filled = filledLines(step, answers);
  if (!filled.length) return "Add at least one.";
  if (filled.length > step.limit.allowed) return `There is room for ${step.limit.allowed} here, and ${filled.length} are listed. Remove some.`;
  const persons = new Set<string>();
  for (const line of filled) {
    const n = lines.indexOf(line) + 1;
    if (step.asksName && !line.name.trim()) return `Add a name for line ${n}.`;
    if (step.person) {
      const problem = personProblem(line.person, `line ${n}`);
      if (problem) return problem;
      const key = samePerson(line.person);
      if (persons.has(key)) return "Two lines are for the same person. Each line is another person.";
      persons.add(key);
    }
    for (const o of step.others) {
      const problem = personProblem(line.others[o.position] ?? meDraft(), `${o.name} on line ${n}`);
      if (problem) return problem;
    }
  }
  return null;
}

function providersProblem({ providers }: Answers): string | null {
  if (providers.nobody) return null;
  const others = providers.others ? providers.people.filter((p) => !blankPerson(p)) : [];
  if (providers.others && !others.length) return "Add the other people, or untick Other people.";
  if (!providers.me && !others.length) return "Say who provides these numbers, or choose Nobody for now.";
  if (others.length > START_PROVIDERS_MAX) return `Add at most ${START_PROVIDERS_MAX} other people.`;
  for (const [i, p] of others.entries()) {
    const problem = personProblem(p, `person ${i + 1}`);
    if (problem) return problem;
  }
  return null;
}

/** Why this screen cannot go on yet, in words to show beside its button, or null. */
export function stepProblem(step: StartStep, answers: Answers, style: NumberStyle = "1,234.5"): string | null {
  if (step.step === "lines") return linesProblem(step, answers);
  if (step.step === "who") return personProblem(answers.who[step.position] ?? meDraft(), step.name);
  if (step.step === "providers") return providersProblem(answers);
  if (step.step === "numbers") {
    const bad = Object.entries(answers.numbers).find(([key, text]) => text.trim() && step.asks.some((a) => key.startsWith(`${a.metric}|`)) && readNumber(text, style) === null);
    return bad ? `“${bad[1].trim().slice(0, 30)}” is not a number. Correct it, or clear the field.` : null;
  }
  return null;
}

/** The people typed on lines of a pasted list. */
export type Pasted = { people: { name: string; email: string }[]; /** The lines that could not be read. */ unread: string[] };

const ADDRESS = /[^\s<>,;"()]+@[^\s<>,;"()]+\.[^\s<>,;"()]+/;
const PASTE_MAX = 200;

/** Reads a pasted list, one person to a line: "Name, email", "Name <email>", two columns from a spreadsheet, or the
 * address alone, whose first part then stands for the name until the person corrects it. */
export function readPeopleList(text: string): Pasted {
  const out: Pasted = { people: [], unread: [] };
  for (const raw of text.split(/\r?\n/).slice(0, PASTE_MAX)) {
    const line = raw.trim();
    if (!line) continue;
    const email = ADDRESS.exec(line)?.[0].replace(/\.+$/, "");
    if (!email) { out.unread.push(line.slice(0, 120)); continue; }
    const rest = line.replace(email, " ").replace(/[<>()"\t;]/g, " ").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();
    // "Lindqvist, Sara" is a name of two parts, put the usual way round.
    const parts = rest.split(",").map((x) => x.trim()).filter(Boolean);
    const name = parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(" ");
    const fallback = email.split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    out.people.push({ name: (name || fallback).slice(0, 80), email });
  }
  return out;
}

/** Adds pasted people to a Repeat's lines: empty lines give way, an address already listed is not added again, and no
 * more than there is room for. A Repeat that asks no person takes each pasted line as a name. */
export function addPasted(step: LinesStep, answers: Answers, text: string): { answers: Answers; added: number; left: string[] } {
  const kept = filledLines(step, answers);
  const listed = new Set(kept.flatMap((l) => (step.person && l.person.who === "new" ? [l.person.email.trim().toLowerCase()] : [])));
  const read: Pasted = step.person ? readPeopleList(text) : { people: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, PASTE_MAX).map((name) => ({ name: name.slice(0, 60), email: "" })), unread: [] };
  const lines = [...kept];
  const left = [...read.unread];
  let next = answers.next;
  for (const p of read.people) {
    if (step.person && listed.has(p.email.toLowerCase())) continue;
    if (lines.length >= step.limit.allowed) { left.push(p.email ? `${p.name}, ${p.email}` : p.name); continue; }
    listed.add(p.email.toLowerCase());
    const line = emptyLine(step, { practice: false }, next++);
    lines.push(step.person ? { ...line, person: { who: "new", here: "", name: p.name, email: p.email } } : { ...line, name: p.name });
  }
  const added = lines.length - kept.length;
  return { answers: added ? { ...answers, lines: { ...answers.lines, [step.repeat]: lines }, next } : answers, added, left };
}

/** A step's key in the address and among the screens. */
export const stepKey = (s: StartStep) => (s.step === "lines" ? `lines-${s.repeat}` : s.step === "who" ? `who-${s.position}` : s.step);

/** A step's short name, for the list beside the screens. */
export function stepTitle(s: StartStep): string {
  if (s.step === "lines") return s.name;
  if (s.step === "who") return s.name;
  if (s.step === "providers") return "Who provides the numbers";
  if (s.step === "numbers") return new Set(s.asks.map((a) => a.field)).size === 1 ? s.asks[0].field : "Numbers";
  if (s.step === "source") return "Where numbers come from";
  if (s.step === "check") return "Check and start";
  return "Preview";
}

/** The name of a typed person as the screens show it; "You" for the person setting up. */
export function personName(p: PersonDraft, people: StartPickable[]): string {
  if (p.who === "me") return "You";
  if (p.who === "here") return people.find((x) => x.id === p.here)?.name ?? "";
  return p.name.trim() || p.email.trim();
}

/** What was answered on a step, in a few words, or null when nothing was. */
export function stepAnswer(s: StartStep, answers: Answers, people: StartPickable[]): string | null {
  if (s.step === "lines") {
    const names = filledLines(s, answers).map((l) => (s.asksName ? l.name.trim() : personName(l.person, people))).filter(Boolean);
    return names.length ? names.join(", ") : null;
  }
  if (s.step === "who") return personName(answers.who[s.position] ?? meDraft(), people) || null;
  if (s.step === "providers") {
    const { providers } = answers;
    if (providers.nobody) return "Nobody for now";
    const names = [...(providers.me ? ["You"] : []), ...(providers.others ? providers.people.map((p) => personName(p, people)) : [])].filter(Boolean);
    return names.length ? names.join(", ") : null;
  }
  if (s.step === "numbers") {
    const entered = answers.later ? 0 : s.asks.reduce((n, a) => n + Object.entries(answers.numbers).filter(([k, v]) => k.startsWith(`${a.metric}|`) && v.trim()).length, 0);
    return entered ? `${entered} entered` : "Add later";
  }
  if (s.step === "source") return answers.source === "system" ? "A system or a spreadsheet" : "People type them";
  return null;
}

/** Whether the Position of an asked step is taken by the person setting up until someone new has joined. */
export const heldWords = (asked: StartAsked) => (asked.places.includes("approve") ? "You approve until they have joined." : `You are ${asked.name} until they have joined.`);
