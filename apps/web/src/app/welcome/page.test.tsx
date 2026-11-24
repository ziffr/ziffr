import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`redirect:${to}`); }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/lib/auth", () => ({
  demoOnly: () => process.env.ZIFFR_DEMO_ONLY === "1",
  isDemo: async () => false,
  // A real session left in the browser: sessionUser itself returns null in a demo-only Ziffr, as lib/auth.ts does.
  sessionUser: async () => (process.env.ZIFFR_DEMO_ONLY === "1" ? null : { id: "u1" }),
  personFor: async () => "p1",
  signedIn: async () => ({ personId: "p1", verifiedEmail: null }),
}));
vi.mock("@/lib/viewer", () => ({ myWorkspaces: async () => [] }));
vi.mock("@ziffr/core/invitations", () => ({ joinableWorkspaces: async () => [] }));
vi.mock("@ziffr/core/what-works-here", () => ({ whatThisZiffrOffers: async () => ({ trial: null }) }));
vi.mock("@ziffr/core/workspace-import", () => ({ importOffered: () => false }));
vi.mock("@/components/auth-shell", () => ({ AuthShell: () => null, AuthHeading: () => null }));
vi.mock("./ask", () => ({ AskToJoin: () => null }));
vi.mock("./form", () => ({ WelcomeForm: () => null }));

import WelcomePage from "./page";

describe("the welcome page (Start a workspace)", () => {
  beforeEach(() => { redirect.mockClear(); });
  afterEach(() => { delete process.env.ZIFFR_DEMO_ONLY; });

  it("is not shown in a demo-only Ziffr, even with a real session: it goes to the demo entry", async () => {
    process.env.ZIFFR_DEMO_ONLY = "1";
    await expect(WelcomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
  });

  it("is still shown elsewhere to a signed-in person without a Workspace", async () => {
    await expect(WelcomePage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
