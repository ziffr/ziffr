import { describe, expect, it } from "vitest";
import { inSettings, onPage, settingsGroups, workspaceTree } from "./settings-links";

const hrefs = (role: Parameters<typeof settingsGroups>[0]) => settingsGroups(role).flatMap((g) => g.links.map((l) => l.href));

describe("the sidebar's Workspace tree and Settings list", () => {
  it("gives Guests no Workspace group and no Settings", () => {
    expect(workspaceTree("guest")).toEqual([]);
    expect(settingsGroups("guest")).toEqual([]);
  });
  it("shows Owners and Admins everything, Members only what they can use", () => {
    for (const role of ["owner", "admin"] as const) expect(hrefs(role)).toEqual(expect.arrayContaining(["/settings/feeds", "/settings/webhooks", "/settings/usage", "/audit", "/settings/workspace#size"]));
    for (const href of ["/settings/feeds", "/settings/webhooks", "/settings/usage", "/audit", "/settings/workspace#size"]) expect(hrefs("member")).not.toContain(href);
    expect(hrefs("member")).toEqual(expect.arrayContaining(["/settings/workspace", "/themes", "/settings/packs", "/settings/keys", "/activity"]));
    expect(workspaceTree("member").map((l) => l.label)).toEqual(["Members and Groups", "Workflows", "Connectors", "Sources", "Settings"]);
  });
  it("matches pages ignoring a hash, and finds Settings pages", () => {
    expect(onPage("/settings/workspace", "/settings/workspace#size")).toBe(true);
    expect(onPage("/audit/x", "/audit")).toBe(true);
    expect(onPage("/auditor", "/audit")).toBe(false);
    expect(inSettings("/themes", settingsGroups("owner"))).toBe(true);
    expect(inSettings("/settings/profile", settingsGroups("owner"))).toBe(false);
    expect(inSettings("/themes", settingsGroups("guest"))).toBe(false);
  });
});
