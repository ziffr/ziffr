// The order Home leads a person to a guide in (spec 0052): the Trial Guide first, the Setup Guide once, else the dashboard.
import { describe, expect, it } from "vitest";
import { homeRedirect } from "./home-redirect";

describe("homeRedirect", () => {
  it.each([
    [{ trialGuide: false, setupGuide: false }, null],
    [{ trialGuide: false, setupGuide: true }, "/setup"],
    [{ trialGuide: true, setupGuide: false }, "/try/start"],
    // A trial Workspace keeps the Trial Guide until ticket 12 joins them: it never meets both.
    [{ trialGuide: true, setupGuide: true }, "/try/start"],
  ])("%j goes to %s", (pending, to) => expect(homeRedirect(pending)).toBe(to));
});
