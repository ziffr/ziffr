// The Team step's pure rules (spec 0052, ticket 10; GLOSSARY: Business Function, Pack Audience): who is suggested for a
// Metric, and the words of the four roles.
import { describe, expect, it } from "vitest";
import { suggestPeople } from "./team-setup";
import { WORKSPACE_ROLE_ORDER, WORKSPACE_ROLE_WORDS } from "./role-words";

const people = [
  { id: "a", function: "finance" as const }, { id: "b", function: "sales" as const }, { id: "c", function: null }, { id: "d", function: "finance" as const },
];

describe("suggestPeople", () => {
  it("picks the people whose function is on the list, in the order given", () => {
    expect(suggestPeople(["finance"], people).map((p) => p.id)).toEqual(["a", "d"]);
    expect(suggestPeople(["sales", "finance"], people).map((p) => p.id)).toEqual(["a", "b", "d"]);
  });
  it("never picks a person with no function, and nobody for an empty or missing list", () => {
    expect(suggestPeople(["other"], people)).toEqual([]);
    expect(suggestPeople([], people)).toEqual([]);
    expect(suggestPeople(undefined, people)).toEqual([]);
    expect(suggestPeople(["finance"], [])).toEqual([]);
  });
  it("is the same twice and does not change its input", () => {
    const copy = structuredClone(people);
    expect(suggestPeople(["finance"], people)).toEqual(suggestPeople(["finance"], people));
    expect(people).toEqual(copy);
  });
});

describe("the role words", () => {
  it("has a name and one line for each of the four roles, in order", () => {
    expect(WORKSPACE_ROLE_ORDER).toEqual(["owner", "admin", "member", "guest"]);
    for (const r of WORKSPACE_ROLE_ORDER) { expect(WORKSPACE_ROLE_WORDS[r].label.length).toBeGreaterThan(0); expect(WORKSPACE_ROLE_WORDS[r].line).not.toContain("\n"); }
  });
});
