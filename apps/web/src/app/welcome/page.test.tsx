// Starting a Workspace now belongs to First Steps (spec 0067): the old address leads there and keeps `?another=1`.
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import WelcomePage from "./page";

describe("/welcome", () => {
  it.each([
    [{}, "/first-steps"],
    [{ another: "1" }, "/first-steps?another=1"],
    // Nothing from the address is followed.
    [{ another: "//evil.example" }, "/first-steps?another=1"],
  ])("leads %o to %s", async (query, to) => {
    await WelcomePage({ searchParams: Promise.resolve(query) });
    expect(redirect).toHaveBeenLastCalledWith(to);
  });
});
