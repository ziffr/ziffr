// The words of a connection notice: how an account's name is cleaned, and what each notice says to do.
import { describe, expect, it } from "vitest";
import { connectedWords, disconnectedWords, slackAccountName, telegramAccountName } from "./connection-notice-words";

describe("account names", () => {
  it("keep no address or link, and are cut short", () => {
    expect(telegramAccountName({ first_name: "Cancel at https://evil.example/x", last_name: "<b>now</b>", username: "cleo_tg" })).toBe("“Cancel at https evil example x b now b” (@cleo_tg)");
    expect(telegramAccountName({ username: "no spaces allowed" })).toBe("an account without a name");
    expect(telegramAccountName({ first_name: "é".repeat(90) })).toBe(`“${"é".repeat(40)}”`);
    expect(telegramAccountName(null)).toBe("an account without a name");
    expect(slackAccountName({ profile: { display_name: "", real_name: "Ann <http://x.example> O’Neil" } }, "U123", "Acme.example")).toBe("“Ann http x example O’Neil” (member ID U123) in the Slack workspace “Acme example”");
    expect(slackAccountName(null, "U123", null)).toBe("member ID U123");
  });
});

describe("the notices", () => {
  const base = { service: "telegram", workspace: "Acme", when: "26 November 2026 at 13:00 (UTC)", account: "“Cleo”" } as const;
  it("say what to do, by the link when there is one", () => {
    expect(connectedWords({ ...base, by: "code", disconnect: true }).text).toMatch(/open the link below and press Disconnect/);
    expect(connectedWords({ ...base, by: "code", disconnect: false }).text).toMatch(/open Connectors with the workspace “Acme” chosen and choose Disconnect there/);
    expect(connectedWords({ ...base, service: "slack", by: "code", disconnect: false }).text).toMatch(/choose Forget me on Slack there/);
    expect(connectedWords({ ...base, service: "slack", by: "email", disconnect: false }).text).toMatch(/found your Slack account by your email address[\s\S]*Link my Slack account/);
    expect(disconnectedWords({ ...base, member: false }).text).toMatch(/use your personal form/);
    expect(disconnectedWords({ ...base, member: true }).text).toMatch(/open Connectors/);
  });
});
