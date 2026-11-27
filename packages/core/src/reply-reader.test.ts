import { describe, expect, it } from "vitest";
import { readAnswer } from "./numbers";
import { ANSWER_LANGUAGES } from "./numbers/languages";
import { parseBreakdown } from "./parse";
import { isGreeting, isSignature, noteFrom, NOTE_CHARS, plainLine, replyWords } from "./reply-cleaning";
import { readReply, type ReplyContext, type ReplyFigure, type ReplyReading } from "./reply-reader";

// Spec 0064, "Reading a reply" and "The offer": a table of replies per rule, English and German, without a database.

const TODAY = "2026-11-18";
const OCTOBER = "2026-10-01";

const open = (over: Partial<ReplyFigure> = {}): ReplyFigure => ({ name: "Revenue", period: "month", promptPeriod: OCTOBER, value: null, rule: "overwrite", ...over });
const filled = (value = 45, over: Partial<ReplyFigure> = {}) => open({ value, ...over });

type Setup = Partial<Omit<ReplyContext, "figures">>;
const read = (text: string, figures: ReplyFigure[] = [open()], over: Setup = {}): ReplyReading =>
  readReply(text, { style: "1,234.5", today: TODAY, yearStart: 1, languages: ["en", "de"], email: false, figures, ...over });
const german: Setup = { style: "1.234,5" };
const email: Setup = { email: true, senderName: "Anna Berg" };

/** A reading in few words, so that a table row says all that matters. */
function short(r: ReplyReading): string {
  const note = (n: { text: string } | null) => (n ? ` "${n.text}"` : "");
  switch (r.kind) {
    case "values": {
      const parts = [
        ...r.values.map((v) => `${v.figure}=${v.value}${note(v.note)}`),
        ...r.notes.map((n) => `${n.figure} note${note(n.note)}`),
        ...r.unread.map((u) => `${u.figure} ${u.reading.reason}`),
      ];
      return ["values", parts.join(", "), r.open.length ? `open ${r.open.join(",")}` : ""].filter(Boolean).join(" ");
    }
    case "not_read":
      return `not_read ${r.reading.reason}`;
    case "note":
      return `note${r.figure ? ` ${r.figure}` : ""}${note(r.note)}${r.offer ? ` offer ${r.offer.how} ${r.offer.value}` : ""}${r.sendAlone ? " send_alone" : ""}`;
    case "which_figure":
      return `which ${r.figures.join(",")}`;
    case "accept_offer":
      return `accept ${r.figure} ${r.value}`;
    default:
      return r.kind;
  }
}

type Case = [text: string, reading: string];
const table = (name: string, cases: Case[], figures: () => ReplyFigure[] = () => [open()], over: Setup = {}) =>
  describe(name, () => {
    it.each(cases)("reads %j", (text, reading) => expect(short(read(text, figures(), over))).toBe(reading));
  });

table("the first reply, one figure", [
  ["45", "values 0=45"],
  ["actually 45", "values 0=45"],
  ["45\nTwo deals moved to November.", 'values 0=45 "Two deals moved to November."'],
  ["45\n3 deals slipped", 'values 0=45 "3 deals slipped"'],
  ["45\n\nTwo moved.\n\nMore on Monday.", 'values 0=45 "Two moved.\n\nMore on Monday."'],
  ["Hello there\n45\nsee above", 'values 0=45 "see above"'],
  ["October\n45", "values 0=45"],
  ["45 in October\nfine", 'values 0=45 "fine"'],
  ["45\n46", "not_read several_numbers"],
  ["45\nbecause\n46", "not_read several_numbers"],
  ["45\nOctober: 46", "not_read several_numbers"],
  ["45 or 46", "not_read several_numbers"],
  ["no idea yet", "not_read no_number"],
  ["yes", "not_read no_number"],
  ["no", "not_read no_number"],
  ["2026", "values 0=2026"],
  ["", "nothing"],
  [" \n \n", "nothing"],
]);

table("the first reply, German", [
  ["1.234,5\nZwei Aufträge sind verschoben.", 'values 0=1234.5 "Zwei Aufträge sind verschoben."'],
  ["Oktober\n45", "values 0=45"],
  ["45\n46", "not_read several_numbers"],
  ["weiß ich noch nicht", "not_read no_number"],
  ["ja", "not_read no_number"],
], () => [open()], german);

table("Breakdowns", [
  ["North 40\nSouth 5", "values 0=45"],
  ["North 40\nSouth 5\nSouth was slow.", 'values 0=45 "South was slow."'],
  ["North: 40; South: 5", "values 0=45"],
  ["North 40\nSouth 5\nTotal 45", "values 0=45"],
  ["45\nNorth 40\nSouth 5", "values 0=45"],
  ["45\n\nNorth 40\nSouth 5\nSouth was slow.", 'values 0=45 "South was slow."'],
  // Rows that do not add up to the lone number above them are words about it.
  ["45\nNorth 40\nSouth 7", 'values 0=45 "North 40\nSouth 7"'],
  // One row is no Breakdown.
  ["45\nNorth 45", 'values 0=45 "North 45"'],
]);

it("names the rows of a Breakdown and the words that give its value", () => {
  const r = read("45\nNorth 40\nSouth 5\nSouth was slow.");
  expect(r.kind === "values" && r.values[0]).toMatchObject({ period: OCTOBER, answer: "North 40\nSouth 5", rows: [{ label: "North", value: 40 }, { label: "South", value: 5 }] });
  const unasked = read("North 40\nSouth 5", [open({ promptPeriod: null })]);
  expect(unasked.kind === "values" && unasked.values[0].period).toBe("2026-11-01");
});

it("takes the period from words on or above the value line", () => {
  const r = read("September\n45", [open({ promptPeriod: null })]);
  expect(r.kind === "values" && r.values[0]).toMatchObject({ period: "2026-09-01", answer: "September\n45" });
});

table("an email", [
  ["Hi Ziffr,\n45\nTwo deals moved.\n\nSee you.", 'values 0=45 "Two deals moved."'],
  ["45\n\nTwo deals moved.\nMore soon.", 'values 0=45 "Two deals moved.\nMore soon."'],
  ["45\n\n\nAnna", "values 0=45"],
  ["45\nTwo deals moved.\nBest regards,\nAnna Berg", 'values 0=45 "Two deals moved."'],
  ["45\nKind regards, Anna", "values 0=45"],
  ["45\nAnna", "values 0=45"],
  ["45\nAnna Berg\nHead of Sales", "values 0=45"],
  ["45\nSent from my iPhone", "values 0=45"],
  ["45\n-- \nAnna", "values 0=45"],
  ["45\n\nOn Tue, 3 Nov 2026, Ziffr wrote:\n> 7", "values 0=45"],
  ["Dear Ziffr team\n\n45", "values 0=45"],
  ["Best regards", "not_read no_number"],
], () => [open()], email);

table("an email in German", [
  ["Hallo Ziffr,\n\n45\nZwei Aufträge verschoben.\nViele Grüße\nAnna", 'values 0=45 "Zwei Aufträge verschoben."'],
  ["45\nMit freundlichen Grüßen", "values 0=45"],
  ["45\nVon meinem iPhone gesendet", "values 0=45"],
  ["45\nGesendet von meinem Samsung Galaxy gesendet", "values 0=45"],
  ["45\nAm Di., 3. Nov. 2026 um 10:00 schrieb Ziffr <z@x>:\n> 7", "values 0=45"],
], () => [open()], { ...email, ...german });

it("takes a chat message whole: no greeting, signature or paragraph rule", () => {
  expect(short(read("45\nTwo moved.\n\nBest regards"))).toBe('values 0=45 "Two moved.\n\nBest regards"');
});

table("a later reply", [
  ["47", "values 0=47"],
  ["47 €", "values 0=47"],
  ["USD 47.", "values 0=47"],
  ["October: 47", "values 0=47"],
  ["October\n47", "values 0=47"],
  ["1: 47", "values 0=47"],
  ["Correction: 47", "values 0=47"],
  ["Revenue: 47", "values 0=47"],
  ["2050", "values 0=2050"],
  ["47\nI forgot one.", 'values 0=47 "I forgot one."'],
  ["North 40\nSouth 7", "values 0=47"],
  ["47\n48", "not_read several_numbers"],
  ["actually 47", 'note "actually 47" offer overwrite 47'],
  ["3 deals slipped", 'note "3 deals slipped" offer overwrite 3'],
  ["1: 3 deals slipped", 'note "3 deals slipped" offer overwrite 3'],
  ["- 47", 'note "- 47" offer overwrite 47'],
  ["47 all", 'note "47 all" offer overwrite 47'],
  ["Two deals moved.", 'note "Two deals moved."'],
  ["still 45, as said", 'note "still 45, as said"'],
  ["3 of 7 slipped", 'note "3 of 7 slipped" send_alone'],
  ["3 deals slipped in October", 'note "3 deals slipped in October" offer overwrite 3'],
  ["thanks", "closed"],
  ["No, thanks!", "closed"],
  ["no", "closed"],
  ["-", "closed"],
  ["yes", "nothing"],
  ["Yes.", "nothing"],
  ["ok", 'note "ok"'],
  ["", "nothing"],
], () => [filled()]);

table("a later reply in German", [
  ["47", "values 0=47"],
  ["eigentlich 47", 'note "eigentlich 47" offer overwrite 47'],
  ["3 Aufträge sind verschoben", 'note "3 Aufträge sind verschoben" offer overwrite 3'],
  ["Nein danke", "closed"],
  ["nein", "closed"],
  ["Danke!", "closed"],
  ["ja", "nothing"],
], () => [filled()], german);

table("a later email", [
  ["Thanks,\n3 deals slipped\n\nAnna", 'note "Thanks,\n3 deals slipped" offer overwrite 3'],
  ["Thanks,\nAnna", "closed"],
  ["Sent from my iPhone", "nothing"],
  ["Two deals moved.\nBest regards\nAnna Berg, +49 30 1234", 'note "Two deals moved."'],
  ["47\n\nBest regards", "values 0=47"],
  // The note ends at the first empty line, and what is left only signs off.
  ["thanks\n\nbut it was 47", "nothing"],
  ["> 7", "nothing"],
], () => [filled()], email);

describe("the offer", () => {
  it.each([
    ["overwrite", false, 'note "3 deals slipped" offer overwrite 3'],
    ["add", false, 'note "3 deals slipped" offer add 3'],
    ["keep_both", false, 'note "3 deals slipped" offer keep_both 3'],
    ["reject", false, 'note "3 deals slipped"'],
    ["overwrite", true, 'note "3 deals slipped" offer correction 3'],
    ["reject", true, 'note "3 deals slipped" offer correction 3'],
  ] as const)("follows the Submission Rule %s, locked %s", (rule, locked, reading) => {
    expect(short(read("3 deals slipped", [filled(45, { rule, locked })]))).toBe(reading);
  });

  it("asks for the number alone only where a new value could be taken", () => {
    expect(short(read("3 of 7", [filled(45, { rule: "reject" })]))).toBe('note "3 of 7"');
  });

  const offered: Setup = { openOffer: { figure: 0, value: 3 } };
  it.each(["yes", "Yes!", "yes please", "ja", "Ja, bitte."])("is taken by %j", (text) => {
    expect(short(read(text, [filled()], offered))).toBe("accept 0 3");
  });

  it("is taken by yes above an email's signature", () => {
    expect(short(read("Yes\n\nBest regards\nAnna", [filled()], { ...email, ...offered }))).toBe("accept 0 3");
  });

  it.each([
    ["ok", 'note "ok"'],
    ["thanks", "closed"],
    ["yes, it was 3", 'note "yes, it was 3" offer overwrite 3'],
    ["47", "values 0=47"],
  ])("is not taken by %j, which is read as usual", (text, reading) => {
    expect(short(read(text, [filled()], offered))).toBe(reading);
  });

  it("is not there for yes without an open offer, open figure or not", () => {
    expect(short(read("yes", [filled()]))).toBe("nothing");
    expect(short(read("yes", [open()]))).toBe("not_read no_number");
    expect(short(read("yes", [filled(), filled()]))).toBe("nothing");
  });
});

const three = () => [open(), open({ name: "New customers" }), open({ name: "Churn", unit: "%" })];

table("several figures", [
  ["1: 45\n2: 7\n3: 2.5 %", "values 0=45, 1=7, 2=2.5"],
  ["Revenue: 45 €\nnew customers: 7", "values 0=45, 1=7 open 2"],
  ["1: 45\nTwo moved.\n2: 7", 'values 0=45 "Two moved.", 1=7 open 2'],
  ["3: 2\n1: 45", "values 0=45, 2=2 open 1"],
  ["1: about 45\n2: 7", "values 1=7 open 0,2"],
  ["1: soon\n2: 7", "values 1=7, 0 no_number open 0,2"],
  ["1: 45\n1: 46", "values 0 several_numbers open 0,1,2"],
  ["1: 45\n46\n2: 7", "values 1=7, 0 several_numbers open 0,2"],
  ["45\n7\n2", "values 0=45, 1=7, 2=2"],
  ["45\nTwo moved.\n7\n2", 'values 0=45 "Two moved.", 1=7, 2=2'],
  ["45\n7", "values open 0,1,2"],
  ["45\n7\n2\n9", "values open 0,1,2"],
  ["45 7 2", "values open 0,1,2"],
  ["not yet", "values open 0,1,2"],
  ["9: 45", "values open 0,1,2"],
], three);

const mixed = () => [filled(45), open({ name: "New customers" }), open({ name: "Churn" })];

table("several figures, one already in", [
  ["7\n2", "values 1=7, 2=2"],
  ["7", "values open 1,2"],
  ["1: 3 deals slipped", 'note "3 deals slipped" offer overwrite 3'],
  ["1: 47", "values 0=47 open 1,2"],
  ["1: 3 deals slipped\n2: 7", 'values 1=7, 0 note "3 deals slipped" open 2'],
  ["3 deals slipped", 'note "3 deals slipped" offer overwrite 3'],
  ["no thanks", "closed"],
], mixed);

const allIn = () => [filled(45), filled(7, { name: "New customers" })];

table("several figures, all in", [
  ["3 deals slipped", "which 0,1"],
  ["45", "which 0,1"],
  ["2: 3 left", 'note 1 "3 left" offer overwrite 3'],
  ["New customers: 8", "values 1=8"],
  ["1: slow\n2: fast", 'values 0 note "slow", 1 note "fast"'],
  ["thanks", "closed"],
], allIn);

table("several figures, German email", [
  ["Hallo,\n1: 45\nZwei verschoben.\n2: 7\n\nViele Grüße\nAnna", 'values 0=45 "Zwei verschoben.", 1=7'],
  ["45\n7\nViele Grüße\nAnna", "values 0=45, 1=7"],
], () => [open({ name: "Umsatz" }), open({ name: "Neukunden" })], { ...email, ...german });

it("does not guess between two figures of one name", () => {
  expect(short(read("Revenue: 45", [open(), open()]))).toBe("values open 0,1");
});

describe("replies accepted today", () => {
  /** What takeValue reads from a text today: a Breakdown's total, or the one number. */
  function today(text: string, promptPeriod: string | null = OCTOBER) {
    const rows = parseBreakdown(text, "1,234.5");
    if (rows) return { value: rows.total ?? rows.rows.reduce((a, r) => a + r.value, 0), period: OCTOBER };
    const r = readAnswer(text, { style: "1,234.5", today: TODAY, yearStart: 1, period: "month", promptPeriod, languages: ["en", "de"] });
    return r.ok ? { value: r.value, period: r.period } : null;
  }

  const SAME = [
    "45", " 45 ", "45.", "45 €", "€45", "1,234.5", "-3", "12k", "actually 45", "about 45 last month", "We closed 45 deals",
    "October: 45", "45 in October", "October\n45", "last month 45", "2026", "45 for October 2026", "North 40\nSouth 5",
    "North: 40; South: 5", "North 40\nSouth 5\nTotal 45", "45\nthanks", "45\n\nBest regards", "Hello\n45", "Revenue 45\nall good",
  ];
  it.each(SAME)("gives the same value and period for %j", (text) => {
    const before = today(text);
    expect(before).not.toBeNull();
    for (const over of [{}, email]) {
      const r = read(text, [open()], over);
      expect(r.kind === "values" && { value: r.values[0].value, period: r.values[0].period }).toEqual(before);
    }
  });

  // The cases spec 0064 changes, each with what today reads and what the reader reads.
  it.each([
    ["words with a number, once the value is in, are a note and an offer", "actually 47", filled(), 47, 'note "actually 47" offer overwrite 47'],
    ["a lone number over rows that do not add up is the value, not their sum", "45\nNorth 40\nSouth 7", open(), 47, 'values 0=45 "North 40\nSouth 7"'],
    ["rows under a worded value line are its note", "We made 50 so far\nNorth 40\nSouth 5", open(), 45, 'values 0=50 "North 40\nSouth 5"'],
    ["a row above the first value line is not part of the Breakdown", "Revenue 2025\nNorth 40\nSouth 5", open(), 2070, "values 0=45"],
  ] as const)("changes as the spec says: %s", (_name, text, figure, before, now) => {
    expect(today(text)?.value).toBe(before);
    expect(short(read(text, [figure]))).toBe(now);
  });

  it("changes as the spec says: period words under the value belong to the note", () => {
    const text = "45\nbetter than September";
    expect(today(text, null)?.period).toBe("2026-09-01");
    const r = read(text, [open({ promptPeriod: null })]);
    expect(r.kind === "values" && r.values[0]).toMatchObject({ value: 45, period: "2026-11-01", note: { text: "better than September" } });
  });

  it("accepts a number in the words under a value, which today asks back", () => {
    expect(today("45\n3 deals slipped")).toBeNull();
    expect(short(read("45\n3 deals slipped"))).toBe('values 0=45 "3 deals slipped"');
  });
});

describe("the words of a reply", () => {
  it.each(Object.keys(ANSWER_LANGUAGES))("are listed for %s, with ok and thanks never a yes", (code) => {
    for (const list of ["yes", "no", "greetings", "closings", "sentFrom"] as const) expect(replyWords([code], list).length).toBeGreaterThan(0);
    const yes = replyWords([code], "yes");
    expect(yes).not.toContain("ok");
    for (const word of replyWords([code], "no")) expect(yes).not.toContain(word);
    for (const word of [...yes, ...replyWords([code], "no"), ...replyWords([code], "closings")]) expect(plainLine(word)).toBe(word);
    for (const pattern of replyWords([code], "sentFrom")) expect(pattern.split("…")).toHaveLength(2);
  });

  it("are those of the Workspace's Answer Languages only", () => {
    expect(short(read("ja", [filled()], { languages: ["en"] }))).toBe('note "ja"');
    expect(isSignature("Viele Grüße", ["en"])).toBe(false);
    expect(isSignature("Viele Grüße", ["de"])).toBe(true);
  });

  it("tell a greeting from something the person wrote", () => {
    expect(isGreeting("Good morning, Anna Berg,", ["en"])).toBe(true);
    expect(isGreeting("Hi, 45", ["en"])).toBe(false);
    expect(isGreeting("Hi all, here is what we know so far", ["en"])).toBe(false);
    expect(isGreeting("History matters", ["en"])).toBe(false);
  });
});

describe("a note", () => {
  it("keeps line breaks and loses control and direction characters", () => {
    const hidden = [0, 7, 0x1b, 0x061c, 0x200e, 0x202e, 0x2066, 0x2069].map((c) => String.fromCharCode(c)).join("");
    expect(noteFrom([`a${hidden}\tb`, "c"])).toEqual({ text: "a b\nc", cut: false });
    expect(noteFrom([hidden, "  "])).toBeNull();
  });

  it("is cut at 1,000 characters, whole characters only, and says so", () => {
    expect(noteFrom(["x".repeat(NOTE_CHARS)])?.cut).toBe(false);
    const long = noteFrom(["😀".repeat(NOTE_CHARS + 1)]);
    expect(long?.cut).toBe(true);
    expect([...long!.text]).toHaveLength(NOTE_CHARS);
    const r = read(`45\n${"x".repeat(2000)}`);
    expect(r.kind === "values" && r.values[0].note).toMatchObject({ cut: true });
  });
});

describe("hostile input", () => {
  const fifty = () => Array.from({ length: 50 }, (_, i) => filled(i, { name: `Metric ${i}` }));
  const TEXTS: [string, string][] = [
    ["a very long line", "x".repeat(2_000_000)],
    ["digits that end in a letter", `a ${"1 ".repeat(2490)}x`],
    ["short runs of spaces around digits", `a${"   1".repeat(1240)}   x`],
    ["spaces around a number", `a${" ".repeat(1600)}1${" ".repeat(1600)}x\n`.repeat(2)],
    ["single spaces and digits", "1 ".repeat(2500)],
    ["many lines", "1\n".repeat(100_000)],
    ["many empty lines", `45${"\n".repeat(5000)}x`],
    ["many rows", "a 1\n".repeat(1250)],
    ["many numbered lines", "1: 1\n".repeat(1000)],
    ["many colons", "a:".repeat(2500)],
    ["a long run of endings", `yes${"!".repeat(4990)}x`],
    ["a long quote line", `On ${"wrote ".repeat(800)}x`],
    ["many period words", "October ".repeat(600)],
    ["many greetings", "Hi\n".repeat(1600)],
  ];
  it.each(TEXTS)("reads %s quickly", (_name, text) => {
    const started = performance.now();
    for (const figures of [[open()], [filled()], fifty()]) for (const over of [{}, email]) read(text, figures, over);
    // Six readings; a generous bound, so that only a pattern that blows up fails on a slow machine.
    expect(performance.now() - started).toBeLessThan(6000);
  });
});
