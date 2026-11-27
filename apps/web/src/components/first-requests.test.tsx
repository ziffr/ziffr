// @vitest-environment node
// The first requests of a Set up (spec 0058; GLOSSARY: Pack, Prompt, Submitter): off until chosen, the count and who
// gets them said before confirming, and afterwards what went out and who or what asks for the rest.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ownRequests, RequestsAfterSetUp, SendFirstRequests } from "./first-requests";

const entry = (key: string, over: { derived?: boolean; by?: "system" | "target" | "person" } = {}) =>
  ({ key, derived: over.derived ?? false, comesFrom: over.by ? { by: over.by } : null }) as unknown as Parameters<typeof ownRequests>[0][number];
const entries = [entry("a"), entry("b", { by: "person" }), entry("c", { by: "system" }), entry("d", { by: "target" }), entry("e", { derived: true }), entry("f")];
const all = new Set(["a", "b", "c", "d", "e"]);

describe("how many requests the person setting up would get", () => {
  it("counts one for each picked Metric somebody types, and the others only when asked for", () => {
    expect(ownRequests(entries, all, false)).toEqual([{ name: "you", count: 2, you: true }]);
    expect(ownRequests(entries, all, true)).toEqual([{ name: "you", count: 4, you: true }]);
    expect(ownRequests(entries, new Set(["e"]), true)).toEqual([]);
  });
});

describe("the tick that sends the first requests", () => {
  const tick = (to: Parameters<typeof SendFirstRequests>[0]["to"], over: { checked?: boolean; followed?: boolean } = {}) =>
    renderToStaticMarkup(<SendFirstRequests to={to} checked={over.checked ?? false} followed={over.followed} onChange={() => {}} />);

  it("is unticked and says how many messages go to whom", () => {
    const h = tick([{ name: "Sara", count: 13, you: true }, { name: "Anna", count: 1, you: false }]);
    expect(h).toContain("Send the first requests now: 13 messages to you, 1 message to Anna");
    expect(h).not.toContain("checked=");
    expect(h).toContain("setting up sends no request.");
  });
  it("says when the values are asked for otherwise", () => {
    const to = [{ name: "you", count: 2, you: true }];
    expect(tick(to, { followed: true })).toContain("The Workflow asks at its next run.");
    expect(tick(to, { followed: false })).toContain("nothing asks by itself");
    expect(tick(to, { checked: true, followed: true })).toContain("One message for each Metric and person, for the period that ended last.");
  });
  it("counts people instead of naming a long list, and is not shown with nobody to ask", () => {
    expect(tick(Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, count: 2, you: false })))).toContain("14 messages to 7 people");
    expect(tick([])).toBe("");
  });
});

describe("after Set up", () => {
  const after = (messages: number, later: Parameters<typeof RequestsAfterSetUp>[0]["made"]["later"]) => renderToStaticMarkup(<RequestsAfterSetUp made={{ messages, later }} />);

  it("says that nothing was sent and that the Workflow asks", () => {
    const h = after(0, { nextRun: 13, noWorkflow: [] });
    expect(h).toContain("No request for values was sent.");
    expect(h).toContain("13 Metrics are asked for at the Workflow");
    expect(h).not.toContain("Ask me now");
  });
  it("names the Metrics nothing asks for and points to Ask me now for the person's own", () => {
    const h = after(0, { nextRun: 0, noWorkflow: [{ id: 1, slug: "mrr", name: "MRR", mine: true }, { id: 2, slug: "arr", name: "ARR", mine: false }] });
    expect(h).toContain('href="/metrics/mrr"');
    expect(h).toContain("choose Ask me now");
    expect(h).toContain('href="/metrics/arr"');
    expect(h).toContain("A Workflow on the Metric asks for its values.");
  });
  it("counts what went out", () => {
    expect(after(1, { nextRun: 0, noWorkflow: [] })).toContain("1 request for values sent now.");
  });
});
