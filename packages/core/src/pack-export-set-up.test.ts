// The set-up questions of an exported Pack (spec 0068, #1346; GLOSSARY: Pack, Position, Repeat): what the author writes
// makes the file ziffr.pack/3 and is read by the set-up; the pack kit's checks refuse what does not fit and each refusal
// is said at its field; nothing but the fields is taken from what a browser sends.
import { describe, expect, it } from "vitest";
import { PACK_SET_UP_LIMITS as L } from "@ziffr/pack/set-up";
import { checkPackValue, type Pack } from "./pack";
import { setUpProblems, withSetUp, type PackSetUpChoice } from "./pack-export-set-up";
import { startFromPack } from "./pack-start";
import { startSteps } from "./pack-start-steps";
import { SALES_TEAM } from "./test/sales-team-pack";

const PICKED = new Map([["commit", "metric:1"], ["quota", "catalog:2"], ["gap", "metric:3"]]);
const FULL: PackSetUpChoice = {
  line: "A weekly forecast meeting, prepared for you.",
  happens: ["Monday: your salespeople are asked for their figures", "", "  The sales lead   approves them "],
  needs: ["Names and email addresses of your salespeople"],
  positions: { lead: { question: "Who approves the figures?", hint: "This person checks the numbers each week." } },
  repeats: { rep: { question: "Who is in your sales team?" } },
  asks: { "metric:1": { question: "What is each quota this quarter?", name: "Quota", every: "quarter" } },
};
const long = (n: number) => "x".repeat(n);
const fieldsOf = (input: unknown, pack: Pack = SALES_TEAM) => setUpProblems(pack, PICKED, input).map((p) => p.field);

describe("the set-up questions of an exported Pack", () => {
  it("leaves the Pack as it is where nothing is written", () => {
    for (const input of [undefined, null, "words", {}, { line: "  ", happens: ["", " "], needs: [], positions: { lead: { question: "" } }, repeats: {}, asks: {} }]) {
      const made = withSetUp(SALES_TEAM, PICKED, input);
      expect([made.used, made.pack]).toEqual([false, SALES_TEAM]);
      expect(setUpProblems(SALES_TEAM, PICKED, input)).toEqual([]);
    }
  });

  it("writes a ziffr.pack/3 file the pack kit takes and the set-up reads", () => {
    const { pack, used } = withSetUp(SALES_TEAM, PICKED, FULL);
    expect(used).toBe(true);
    const res = checkPackValue(JSON.parse(JSON.stringify(pack)));
    expect(res.ok ? [] : res.problems).toEqual([]);
    expect([pack.format, pack.setUp?.happens]).toEqual(["ziffr.pack/3", ["Monday: your salespeople are asked for their figures", "The sales lead approves them"]]);
    const read = startFromPack(pack);
    const steps = startSteps(read.declarations, { metrics: null, trial: null, practice: false });
    expect(steps[0]).toMatchObject({ step: "preview", line: FULL.line, needs: FULL.needs });
    expect(steps.find((s) => s.step === "lines")).toMatchObject({ question: "Who is in your sales team?" });
    expect(steps.find((s) => s.step === "who" && s.position === "lead")).toMatchObject({ question: "Who approves the figures?", hint: "This person checks the numbers each week." });
    expect(steps.find((s) => s.step === "numbers")).toMatchObject({ asks: [{ metric: "commit", question: "What is each quota this quarter?", field: "Quota", every: "quarter" }] });
  });

  it("writes one thing alone, such as one number asked", () => {
    const { pack } = withSetUp(SALES_TEAM, PICKED, { asks: { "catalog:2": { question: "What is the team's quota?", name: "Quota", every: "year" } } });
    expect([pack.format, pack.setUp, checkPackValue(pack).ok]).toEqual(["ziffr.pack/3", undefined, true]);
  });

  it("refuses what is too long, at its field, with the kit's words", () => {
    const over = setUpProblems(SALES_TEAM, PICKED, {
      line: long(L.line + 1), happens: ["", long(L.listed + 1)], needs: [long(L.listed + 1)],
      positions: { lead: { question: long(L.question + 1), hint: long(L.hint + 1) } }, repeats: { rep: { question: long(5000) } },
      asks: { "metric:1": { question: long(L.question + 1), name: long(L.name + 1), every: "week" } },
    });
    expect(over.map((p) => p.field).sort()).toEqual(["asks.metric:1.every", "asks.metric:1.name", "asks.metric:1.question", "happens.1", "line", "needs.0", "positions.lead.hint", "positions.lead.question", "repeats.rep.question"]);
    expect(over.find((p) => p.field === "line")?.message).toBe(`has ${L.line + 1} characters; at most ${L.line} are allowed.`);
  });

  it("refuses one line too many", () => {
    expect(fieldsOf({ line: "Short.", happens: ["a", "b", "c", "d", "e"] })).toEqual(["happens.0"]);
    expect(fieldsOf({ line: "Short.", happens: ["a"], needs: ["a", "b", "c", "d", "e"] })).toEqual(["needs.0"]);
  });

  it("asks for the sentence and a line of what happens once any of the three is written", () => {
    expect(fieldsOf({ needs: ["Their names"] }).sort()).toEqual(["happens.0", "line"]);
  });

  it("refuses markup and addresses, so that no email address goes in", () => {
    const bad = fieldsOf({ line: "Write to ana@example.com", happens: ["<b>Bold</b>"], positions: { lead: { question: "See www.example.com" } } });
    expect(bad.sort()).toEqual(["happens.0", "line", "positions.lead.question"]);
  });

  it("refuses an empty field of a number asked, a number on a Derived Metric and a fourth number", () => {
    expect(fieldsOf({ asks: { "metric:1": {} } }).sort()).toEqual(["asks.metric:1.every", "asks.metric:1.name", "asks.metric:1.question"]);
    const ask = { question: "How much?", name: "Target", every: "year" as const };
    expect(fieldsOf({ asks: { "metric:3": ask } })).toEqual(["asks.metric:3"]);
    const many: Pack = { ...SALES_TEAM, contents: { metrics: [1, 2, 3, 4].map((n) => ({ key: `n${n}`, metric: { ...SALES_TEAM.contents.metrics![1].metric, name: `Number ${n}` } })) }, positions: [], repeats: [] };
    const picked = new Map([1, 2, 3, 4].map((n) => [`n${n}`, `metric:${n}`]));
    const four = setUpProblems(many, picked, { asks: Object.fromEntries([1, 2, 3, 4].map((n) => [`metric:${n}`, ask])) });
    expect(four).toEqual([{ field: "asks.metric:4", message: `is one too many: a Pack asks at most ${L.asks} numbers at set-up.` }]);
  });

  it("takes only what the file holds, whatever a browser sends", () => {
    const { pack, used } = withSetUp(SALES_TEAM, PICKED, JSON.parse('{"positions":{"nobody":{"question":"Hi"},"__proto__":{"question":"Hi"}},"repeats":{"constructor":{"question":"Hi"}},"asks":{"metric:99":{"question":"Hi"},"toString":{}},"extra":"x","line":7,"happens":"all","format":"ziffr.pack/9"}'));
    expect([used, pack]).toEqual([false, SALES_TEAM]);
    const written = withSetUp(SALES_TEAM, PICKED, { positions: { lead: { question: "Who?", people: "several", name: "Mia" } } } as never).pack;
    expect(written.positions?.[0]).toEqual({ key: "lead", name: "Sales lead", people: "one", question: "Who?" });
  });
});
