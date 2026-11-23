// @ts-nocheck
import { describe, expect, it } from "vitest";
import { mentionsPerson, nameHider } from "./hide-names";

const sara = { name: "Sara Lindqvist", email: "sara@example.test", slack_handle: "@sara" };

describe("nameHider", () => {
  it("replaces whole names, first names, emails and handles", () => {
    const hide = nameHider([sara]);
    expect(hide("Sara Lindqvist asks: why? Sara wrote to sara@example.test and @sara.")).toBe("Someone asks: why? Someone wrote to Someone and Someone.");
  });
  it("leaves words that only contain a name", () => {
    expect(nameHider([sara])("Sarah and Sarasota stay.")).toBe("Sarah and Sarasota stay.");
  });
  it("hides a short first name as a whole word as written, never inside or as an ordinary word", () => {
    const al = nameHider([{ name: "Al Fox", email: "", slack_handle: "" }]);
    expect(al("Al sent late; Al Fox too.")).toBe("Someone sent late; Someone too.");
    expect(al("It was also al dente, said Alex, in ALL caps.")).toBe("It was also al dente, said Alex, in ALL caps.");
    expect(nameHider([{ name: "A", email: "", slack_handle: "" }])("A day")).toBe("A day");
  });
  it("changes nothing when there is no one to hide", () => {
    expect(nameHider([])("Sara asks")).toBe("Sara asks");
    expect(nameHider([{ name: "A", email: "", slack_handle: "" }])("A")).toBe("A");
  });
});

describe("nameHider, contact details", () => {
  it("matches an email or handle in any capitalisation, a name only as written", () => {
    const hide = nameHider([sara]);
    expect(hide("Mail Sara@Example.Test or @SARA, not SARA LINDQVIST.")).toBe("Mail Someone or Someone, not SARA LINDQVIST.");
  });
});

describe("mentionsPerson", () => {
  it("finds a name, email or handle anywhere in a text, in any case", () => {
    const mentions = mentionsPerson([sara]);
    expect(mentions("revenue-sara")).toBe(true);
    expect(mentions("A + SARA LINDQVIST")).toBe(true);
    expect(mentions("revenue")).toBe(false);
  });
  it("finds no one when there is no one", () => {
    expect(mentionsPerson([])("sara")).toBe(false);
  });
});
