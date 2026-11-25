// @vitest-environment node
// The phone note's gate (spec 0052; GLOSSARY: Setup Guide): the server renders the page itself, only hidden on a
// phone-sized touch screen until the browser has decided; past step 1 there is no gate at all.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PhoneNoteGate } from "./phone-note";

describe("PhoneNoteGate", () => {
  it("renders the page for every device, hidden only on a phone until the browser decides", () => {
    const html = renderToStaticMarkup(<PhoneNoteGate first><p>step</p></PhoneNoteGate>);
    expect(html).toContain("<p>step</p>");
    expect(html).toContain("max-width:640px");
    expect(html).not.toContain("Continue to set up");
  });
  it("is no gate past step 1", () => {
    expect(renderToStaticMarkup(<PhoneNoteGate first={false}><p>step</p></PhoneNoteGate>)).not.toContain("invisible");
  });
});
