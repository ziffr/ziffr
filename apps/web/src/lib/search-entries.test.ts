// The pages and commands Search offers (ticket #530): who is offered what, and how words find them.
import { describe, expect, it } from "vitest";
import { commandEntries, matchEntries, pageEntries } from "./search-entries";

const labels = (r: { label: string }[]) => r.map((e) => e.label);

describe("pageEntries", () => {
  it("offers a Guest only the pages their menus lead to", () => {
    const guest = labels(pageEntries("guest"));
    expect(guest).toEqual(expect.arrayContaining(["Schedule", "Metrics", "My schedule"]));
    // A Guest sees only what is shared with them (#504): no member list, Workflows or Access Keys.
    expect(guest).not.toContain("Members and Groups");
    expect(guest).not.toContain("Workflows");
    expect(guest).not.toContain("Access Keys");
    expect(guest).not.toContain("Webhooks");
    expect(guest).not.toContain("Audit log");
    expect(guest).not.toContain("Themes");
    expect(guest).not.toContain("Packs");
  });
  it("offers Owners and Admins the management pages, a Member not", () => {
    expect(labels(pageEntries("admin"))).toEqual(expect.arrayContaining(["Webhooks", "Audit log", "Usage", "Themes", "Size and Retention"]));
    expect(labels(pageEntries("member"))).not.toContain("Webhooks");
    expect(labels(pageEntries("member"))).not.toContain("Size and Retention");
    expect(labels(pageEntries("member"))).toContain("Themes");
  });
});

describe("commandEntries", () => {
  it("offers creating to those who may create, and inviting to those who may invite", () => {
    expect(labels(commandEntries({ create: true, invite: false }))).toEqual(["New metric", "New dashboard", "New deck", "Paste values"]);
    expect(labels(commandEntries({ create: false, invite: true }))).toEqual(["Invite someone"]);
    expect(commandEntries({ create: false, invite: false })).toEqual([]);
  });
});

describe("matchEntries", () => {
  const all = [...pageEntries("owner"), ...commandEntries({ create: true, invite: true })];
  it("finds pages by their plain words", () => {
    expect(labels(matchEntries(all, "webhook"))[0]).toBe("Webhooks");
    expect(labels(matchEntries(all, "approval"))).toEqual(expect.arrayContaining(["Schedule", "Workflows"]));
    expect(labels(matchEntries(all, "retention"))).toEqual(["Size and Retention"]);
    expect(labels(matchEntries(all, "invite"))).toEqual(expect.arrayContaining(["Invite someone", "Members and Groups"]));
    expect(labels(matchEntries(all, "settings"))).toContain("General");
  });
  it("sends size and limit words to Size and Retention", () => {
    for (const w of ["size", "limit", "workspace limit"]) expect(labels(matchEntries(all, w))[0]).toBe("Size and Retention");
  });
  it("ranks a label that starts with the word before one that holds it or only has it as a plain word", () => {
    expect(labels(matchEntries(all, "met"))[0]).toBe("Metrics");
    expect(labels(matchEntries(all, "groups"))[0]).toBe("Members and Groups");
    expect(labels(matchEntries(all, "sets"))).toEqual([]);
    expect(labels(matchEntries(all, "ooks"))).toEqual(["Webhooks", "Your Webhooks"]);
  });
  it("needs every word, ignores case and accents, and finds nothing for no words", () => {
    expect(labels(matchEntries(all, "NEW métric"))).toEqual(["New metric"]);
    expect(matchEntries(all, "new zebra")).toEqual([]);
    expect(matchEntries(all, "  ")).toEqual([]);
  });
  it("returns at most as many as asked for, in list order among equals", () => {
    expect(matchEntries(all, "e", 3)).toHaveLength(3);
  });
});
