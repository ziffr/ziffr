// @vitest-environment happy-dom
// The demo's countdown (spec 0051, ticket 7): the words at the first draw, the Generation cookie, and that the line counts
// down on its own. The router and the server are replaced; the clock is fake.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { DemoResetLine } from "./demo-reset-line";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = (s: string) => new Date(`2026-11-23T${s}Z`).getTime();
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at("14:16:00"));
  refresh.mockClear();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.cookie = "ziffr-demo-gen=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const draw = (over: Partial<{ generation: number; resetAt: number | null; nextResetAt: number; serverNow: number }> = {}) =>
  act(() => root.render(<DemoResetLine generation={4} resetAt={at("14:10:00")} nextResetAt={at("14:25:00")} serverNow={at("14:16:00")} {...over} />));

/** Moves the clock a second at a time, each in its own act, so that React draws and runs its effects between the timers. */
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 1000) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}

describe("DemoResetLine", () => {
  it("says when the demo resets", () => {
    draw();
    expect(host.textContent?.trim()).toBe("Resets in 9 min.");
  });

  it("says starting fresh right after a reset", () => {
    vi.setSystemTime(at("14:10:20"));
    draw({ serverNow: at("14:10:20") });
    expect(host.textContent?.trim()).toBe("Starting fresh.");
  });

  it("writes the Generation of its page to the cookie", () => {
    draw({ generation: 7 });
    expect(document.cookie).toContain("ziffr-demo-gen=7");
  });

  it("counts down in the browser, from the server's time, without asking the server", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    draw();
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(host.textContent?.trim()).toBe("Resets in 6 min.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the server's time when the visitor's clock is wrong", () => {
    vi.setSystemTime(at("13:00:00"));
    draw({ serverNow: at("14:16:00") });
    expect(host.textContent?.trim()).toBe("Resets in 9 min.");
  });

  it("asks once the slot has passed, and redraws the page when the Generation moved", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ generation: 5 }) }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.setSystemTime(at("14:24:50"));
    draw({ serverNow: at("14:24:50") });
    await advance(60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });

  it("counts on to the next slot when the demo was clean and not reset", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ generation: 4 }) }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.setSystemTime(at("14:24:50"));
    draw({ serverNow: at("14:24:50") });
    await advance(3 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(5);
    expect(host.textContent?.trim()).toMatch(/^Resets in \d+ min\.$/);
  });
});
