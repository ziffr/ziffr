// The First Metric step's words (spec 0052, ticket 9; GLOSSARY: Setup Guide, Quiet Hours, Outbox): what to look for per
// way, the Quiet Hours and cooldown sentences, the "loop works" line and the "Didn't arrive?" checks, with no database.
import { describe, expect, it } from "vitest";
import { cooldownWords, didntArrive, loopWorks, quietAfter, quietBefore, quietUntilWords, sourceWords, whatToLookFor } from "./first-metric-words";

const look = { metric: "MRR", email: "anna@example.org", repliesByEmail: true };

describe("what to look for", () => {
  it("names the email's subject and the address, and says whether a reply is recorded", () => {
    expect(whatToLookFor("email", look)).toBe("An email from Ziffr to anna@example.org whose subject starts with “What’s the number for MRR”. Reply to it with the number, or use the link in it.");
    expect(whatToLookFor("email", { ...look, repliesByEmail: false, email: null })).toBe("An email from Ziffr whose subject starts with “What’s the number for MRR”. Use the link in it to send the number.");
  });
  it("names the direct message in Slack and the bot's message in Telegram", () => {
    expect(whatToLookFor("slack", look)).toContain("direct message from the Ziffr app in Slack");
    expect(whatToLookFor("telegram", look)).toContain("message from Ziffr’s bot in Telegram");
    expect(whatToLookFor("tickets", look)).toContain("form link");
  });
});

describe("the sentences of the loop", () => {
  it("says what arrived and how, and that the loop works", () => {
    expect(loopWorks({ metric: "MRR", period: "November 2026", value: "48,200 EUR", source: "mail" })).toBe("MRR for November 2026: 48,200 EUR, by email reply. The loop works.");
    expect(loopWorks({ metric: "MRR", period: "November 2026", value: "5", source: "web_form" })).toBe("MRR for November 2026: 5, through the form. The loop works.");
    expect(sourceWords("slack")).toBe("Slack answer");
    expect(sourceWords("something")).toBe("a Source");
  });
  it("tells the Quiet Hours before and after asking, with the day when it is not today", () => {
    const now = new Date("2027-03-01T22:30:00Z");
    expect(quietUntilWords(new Date("2027-03-01T23:30:00Z"), now, "UTC")).toBe("23:30");
    expect(quietUntilWords(new Date("2027-03-02T07:00:00Z"), now, "UTC")).toBe("07:00 on Tuesday");
    // The same instant reads in the person's own zone.
    expect(quietUntilWords(new Date("2027-03-02T07:00:00Z"), now, "Asia/Tokyo")).toBe("16:00");
    expect(quietBefore("07:00")).toBe("You are in your Quiet Hours until 07:00: the request will wait until then. It counts as asked, so you can go on.");
    expect(quietAfter("07:00")).toContain("It counts as asked");
  });
  it("says when Ask me now may be pressed again, in whole minutes and at least one", () => {
    const now = new Date("2027-03-01T10:00:00Z");
    expect(cooldownWords("2027-03-01T10:07:30Z", now, "UTC")).toBe("You asked a moment ago. Ziffr asks at most once every 10 minutes: you can ask again in 8 minutes, at 10:07.");
    expect(cooldownWords("2027-03-01T10:00:10Z", now, "UTC")).toContain("in 1 minute,");
  });
});

describe("Didn't arrive?", () => {
  const base = { ways: ["email"] as const, mailReal: true, quietUntil: null, repliesByEmail: true, email: "anna@example.org" };
  it("checks the spam folder for email and always ends with the Outbox", () => {
    const c = didntArrive(base);
    expect(c[0].text).toContain("spam folder of anna@example.org");
    expect(c.at(-1)).toEqual({ text: "See it in the Outbox: it says why a message stayed.", href: "/connectors/outbox", label: "Open the Outbox" });
    expect(c.some((x) => x.text.includes("Quiet Hours"))).toBe(false);
  });
  it("says a simulated mail server keeps email in the Outbox, and that replies are not recorded without inbound mail", () => {
    expect(didntArrive({ ...base, mailReal: false })[0].text).toContain("keeps email in the Outbox instead of sending it");
    expect(didntArrive({ ...base, repliesByEmail: false }).map((x) => x.text)).toContain("Replies by email are not recorded on this Ziffr: use the link in the email.");
  });
  it("names Slack, Telegram and Quiet Hours checks with links to where to fix them", () => {
    const c = didntArrive({ ...base, ways: ["slack", "telegram"], quietUntil: "07:00" });
    expect(c.find((x) => x.text.includes("Messages tab"))?.href).toBe("/connectors");
    expect(c.find((x) => x.text.includes("blocked the bot") || x.text.includes("block the bot"))?.href).toBe("/connectors");
    expect(c.find((x) => x.text.startsWith("Your Quiet Hours until 07:00"))?.href).toBe("/settings/deliveries");
    expect(c.some((x) => x.href?.startsWith("/setup"))).toBe(false);
  });
});
