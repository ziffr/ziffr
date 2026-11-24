import { describe, expect, it, vi } from "vitest";
import { DEMO_TAKES_NO_WORKSPACES, refuseNewWorkspaceInDemoOnly } from "./demo-only";
import { createWorkspace } from "./page-data";
import { claimUpload } from "./workspace-import";

describe("a demo-only Ziffr takes no new Workspaces", () => {
  it("refuses in plain words, and allows everywhere else", () => {
    expect(() => refuseNewWorkspaceInDemoOnly({ ZIFFR_DEMO_ONLY: "1" })).toThrow(DEMO_TAKES_NO_WORKSPACES);
    expect(() => refuseNewWorkspaceInDemoOnly({})).not.toThrow();
    expect(() => refuseNewWorkspaceInDemoOnly({ ZIFFR_DEMO_ONLY: "0" })).not.toThrow();
  });

  it("is what creating a Workspace and importing one ask first, before any database call", async () => {
    vi.stubEnv("ZIFFR_DEMO_ONLY", "1");
    try {
      await expect(createWorkspace("p", "Mine")).rejects.toThrow(DEMO_TAKES_NO_WORKSPACES);
      await expect(claimUpload("p")).rejects.toThrow(DEMO_TAKES_NO_WORKSPACES);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
