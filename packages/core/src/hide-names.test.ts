import { describe, expect, it } from "vitest";
import { nameHider } from "./hide-names";

const sara = { name: "Sara Lindqvist", email: "sara@example.test", slack_handle: "@sara" };

describe("nameHider", () => {
  it("replaces whole names, first names, emails and handles", () => {
    const hide = nameHider([sara]);
    expect(hide("Sara Lindqvist asks: why? Sara wrote to sara@example.test and @sara.")).toBe("Someone asks: why? Someone wrote to Someone and Someone.");
  });
  it("leaves words that only contain a name, and first names under three letters", () => {
    expect(nameHider([sara])("Sarah and Sarasota stay.")).toBe("Sarah and Sarasota stay.");
    expect(nameHider([{ name: "Al Fox", email: "", slack_handle: "" }])("Al said hi; Al Fox too.")).toBe("Al said hi; Someone too.");
  });
  it("changes nothing when there is no one to hide", () => {
    expect(nameHider([])("Sara asks")).toBe("Sara asks");
    expect(nameHider([{ name: "Al", email: "", slack_handle: "" }])("Al")).toBe("Al");
  });
});
