// Where Slack sends a person back after "Add to Slack" (GLOSSARY: Connector, Setup Guide): the Setup Guide only on the
// fixed word its own button leaves, the Connectors page otherwise, and never an address taken from a request.
import { describe, expect, it } from "vitest";
import { slackReturn } from "./slack-back";

const SITE = "https://ziffr.example.test";
describe("the way back from Add to Slack", () => {
  it("goes to the Connectors page without the guide's cookie, as before", () => {
    expect(slackReturn(SITE, "connected", undefined)).toBe(`${SITE}/connectors?slack=connected`);
  });
  it("goes back to the guide's step when its cookie says setup", () => {
    expect(slackReturn(SITE, "connected", "setup")).toBe(`${SITE}/setup?step=ways&slack=connected`);
    expect(slackReturn(SITE, "cancelled", "setup")).toBe(`${SITE}/setup?step=ways&slack=cancelled`);
  });
  it("follows nothing else: any other cookie value is the Connectors page, and an unknown outcome is shown as refused", () => {
    for (const evil of ["https://evil.example", "//evil.example", "/setup", "Setup", "setup/../x", ""]) expect(slackReturn(SITE, "connected", evil)).toBe(`${SITE}/connectors?slack=connected`);
    expect(slackReturn(SITE, "../../x?y=1", "setup")).toBe(`${SITE}/setup?step=ways&slack=refused`);
  });
});
