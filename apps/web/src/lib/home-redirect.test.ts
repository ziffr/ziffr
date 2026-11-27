// The order Home leads a person on in (spec 0052, spec 0067): an Owner to their unfinished First Steps, a Member to their
// Setup Guide, else the dashboard. And where the old Setup Guide address sends an Owner or Admin.
import { describe, expect, it } from "vitest";
import { homeRedirect, managersSetupTarget } from "./home-redirect";

describe("homeRedirect", () => {
  it.each([
    [{ firstSteps: false, setupGuide: false }, null],
    [{ firstSteps: false, setupGuide: true }, "/setup"],
    [{ firstSteps: true, setupGuide: false }, "/first-steps"],
    [{ firstSteps: true, setupGuide: true }, "/first-steps"],
  ])("%j goes to %s", (pending, to) => expect(homeRedirect(pending)).toBe(to));
});

describe("/setup for an Owner or Admin", () => {
  it.each([
    ["ways", "/connectors"],
    ["team", "/team"],
    [undefined, "/"],
    ["start", "/"],
    ["//evil.example", "/"],
  ])("step %s leads to %s", (step, to) => expect(managersSetupTarget(step)).toBe(to));
});
