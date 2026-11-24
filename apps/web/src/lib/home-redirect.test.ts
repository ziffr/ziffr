// The order Home leads a person to the Setup Guide in (spec 0052, ticket 12): once to the guide, else the dashboard. A trial
// has no guide of its own, so a new trial lands in /setup through the same rule, never on an empty dashboard.
import { describe, expect, it } from "vitest";
import { homeRedirect } from "./home-redirect";

describe("homeRedirect", () => {
  it.each([
    [{ setupGuide: false }, null],
    [{ setupGuide: true }, "/setup"],
  ])("%j goes to %s", (pending, to) => expect(homeRedirect(pending)).toBe(to));
});
