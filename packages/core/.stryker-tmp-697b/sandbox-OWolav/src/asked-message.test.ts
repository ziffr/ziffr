// @ts-nocheck
import { describe, expect, it } from "vitest";
import { firstAsksMessage, type FirstAsk } from "./asked-message";

const ask = (name: string, state: FirstAsk["state"], connector = "email", label = "Email"): FirstAsk => ({ personId: name, name, connector, label, state });

describe("firstAsksMessage", () => {
  it("says nobody submits it yet", () => {
    expect(firstAsksMessage({ submitters: 0, asked: [] })).toBe("Nobody submits it yet: add Submitters under Who submits on its Description tab.");
  });
  it("says when only programs submit", () => {
    expect(firstAsksMessage({ submitters: 1, asked: [] })).toContain("programs");
  });
  it("names who got a form link, by way", () => {
    expect(firstAsksMessage({ submitters: 3, asked: [ask("Ana", "sent"), ask("Bo", "sent"), ask("Cy", "sent", "slack", "Slack")] })).toBe(
      "Ana, Bo got a form link and a first request by email. Cy got a form link and a first request through Slack.");
  });
  it("says what stayed in the Outbox, and what is queued or failed", () => {
    const m = firstAsksMessage({ submitters: 4, asked: [ask("Ana", "outbox"), ask("Bo", "outbox", "slack", "Slack"), ask("Cy", "queued"), ask("Di", "failed")] });
    expect(m).toContain("Email is not set up on this Ziffr, so nothing was sent to Ana");
    expect(m).toContain("Slack does not send for real here, so the request to Bo waits in the Outbox.");
    expect(m).toContain("Cy will get a form link");
    expect(m).toContain("The request to Di could not be delivered.");
  });
});
