// What a Pack's `ziffr` minimum is held to: a release to its own version, any other build to its major.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

/** The two versions as a build with this ZIFFR_VERSION has them. */
async function built(env: string) {
  vi.stubEnv("ZIFFR_VERSION", env);
  vi.resetModules();
  return import("./ziffr-version");
}

describe("the version a Pack is held to", () => {
  it("is the release's own in a release", async () => {
    const v = await built("0.19.0");
    expect([v.ZIFFR_VERSION, v.PACK_ZIFFR_VERSION]).toEqual(["0.19.0", "0.19.0"]);
  });

  it.each(["", "dev", "main-0123abc"])("is above every release of the major in a build that is none (“%s”)", async (env) => {
    const v = await built(env);
    expect(v.PACK_ZIFFR_VERSION).toBe(`${v.ZIFFR_VERSION.split(".")[0]}.9999.0`);
  });
});
