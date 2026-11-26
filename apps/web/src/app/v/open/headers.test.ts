/** What the page of an opened View Link tells caches. */
import { describe, expect, it } from "vitest";
import config from "../../../../next.config";

describe("the response headers of an opened View Link", () => {
  it("keep it out of every cache", async () => {
    const rules = await config.headers!();
    const own = rules.find((r) => r.source === "/v/open/:path*");
    expect(own?.headers).toEqual([{ key: "Cache-Control", value: "private, no-store" }]);
  });
});
