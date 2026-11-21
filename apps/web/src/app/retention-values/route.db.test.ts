// GET /retention-values over HTTP: the file for those who may set the Metric's Retention, a refusal said in words
// otherwise, and nothing at all when another site makes the browser ask (the download is written in the Audit Log). Who
// may, and what is in the file, is the core's (retention-job.db.test.ts); here it stands in.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "@ziffr/core/actor";

vi.mock("@/lib/viewer", () => ({ currentActor: vi.fn(async () => ({ personId: "p", workspaceId: "w", role: "member" })) }));
vi.mock("@ziffr/core/retention-setting", () => ({ retentionValuesCsv: vi.fn(async () => '"Metric"\r\n') }));
import { retentionValuesCsv } from "@ziffr/core/retention-setting";
import { GET } from "./route";

const get = (query: string, site?: string) => GET(new Request(`http://ziffr.test/retention-values?${query}`, { headers: site ? { "sec-fetch-site": site } : {} }));
beforeEach(() => vi.mocked(retentionValuesCsv).mockClear());

describe("GET /retention-values", () => {
  it("gives the file, reading the setting as untrusted input and never caching it", async () => {
    const res = await get("metric=7&keep=36&then=delete");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe('"Metric"\r\n');
    expect(retentionValuesCsv).toHaveBeenCalledWith(expect.anything(), 7, { keep_months: 36, then: "delete" });
    // Anything else is sent on as it came, for the core to refuse in words.
    await get("metric=7&keep=36&then=condense&into=month", "same-origin");
    expect(retentionValuesCsv).toHaveBeenLastCalledWith(expect.anything(), 7, { keep_months: 36, then: "condense", into: "month" });
  });
  it("refuses a request another site made the browser send, before the core is asked", async () => {
    for (const site of ["cross-site", "same-site"]) expect((await get("metric=7&keep=36&then=delete", site)).status).toBe(403);
    expect(retentionValuesCsv).not.toHaveBeenCalled();
    expect((await get("metric=7&keep=36&then=delete", "none")).status).toBe(200);
  });
  it("says 403 to someone who may not, and the reason for a setting that does not fit", async () => {
    vi.mocked(retentionValuesCsv).mockRejectedValueOnce(new Forbidden("Only Owners, Admins and the Metric's owner set its Retention."));
    expect(await get("metric=7&keep=36&then=delete")).toMatchObject({ status: 403 });
    vi.mocked(retentionValuesCsv).mockRejectedValueOnce(new Error("Nothing would go today, so there is nothing to download."));
    const res = await get("metric=7&keep=36&then=delete");
    expect([res.status, await res.text()]).toEqual([400, "Nothing would go today, so there is nothing to download."]);
    // A failure that is not a sentence for people is not shown.
    vi.mocked(retentionValuesCsv).mockRejectedValueOnce(new TypeError("boom"));
    await expect(get("metric=7&keep=36&then=delete")).rejects.toThrow("boom");
  });
});
