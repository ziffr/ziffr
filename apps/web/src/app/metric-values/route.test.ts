// GET /metric-values over HTTP (spec 0056): the file for those who may have it, a refusal said in words otherwise, and
// nothing at all when another site makes the browser ask (the download is written in the Audit Log). Who may, and what
// is in the file, is the core's (metric-values-export.db.test.ts); here it stands in.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";

vi.mock("@/lib/viewer", () => ({ currentActor: vi.fn(async () => ({ personId: "p", workspaceId: "w", role: "member" })) }));
vi.mock("@ziffr/core/metric-values-export", () => ({ EXPORT_METRICS: 50, exportMetricValues: vi.fn(async () => ({ csv: '"metric"\r\n', metrics: 1, rows: 0 })) }));
import { exportMetricValues } from "@ziffr/core/metric-values-export";
import { currentActor } from "@/lib/viewer";
import { GET } from "./route";

const get = (query: string, site?: string) => GET(new Request(`http://ziffr.test/metric-values?${query}`, { headers: site ? { "sec-fetch-site": site } : {} }));
beforeEach(() => vi.mocked(exportMetricValues).mockClear());

describe("GET /metric-values", () => {
  it("gives the file for the chosen Metrics, never cached", async () => {
    const res = await get("metric=revenue&metric=costs&other=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="ziffr-values.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe('"metric"\r\n');
    expect(exportMetricValues).toHaveBeenCalledWith(expect.anything(), ["revenue", "costs"]);
  });
  it("hands the core one slug more than the limit at most, so it can refuse a long list in words", async () => {
    await get(Array.from({ length: 80 }, (_, i) => `metric=m-${i}`).join("&"));
    expect(vi.mocked(exportMetricValues).mock.calls[0][1]).toHaveLength(51);
  });
  it("refuses a request another site made the browser send, before the core is asked", async () => {
    for (const site of ["cross-site", "same-site"]) expect((await get("metric=revenue", site)).status).toBe(403);
    expect(exportMetricValues).not.toHaveBeenCalled();
    for (const site of ["same-origin", "none"]) expect((await get("metric=revenue", site)).status).toBe(200);
  });
  it("refuses someone who is no member of the Workspace in words, and lets a redirect to sign in pass", async () => {
    vi.mocked(currentActor).mockRejectedValueOnce(new Error("Not a member of this workspace."));
    const res = await get("metric=revenue");
    expect([res.status, res.headers.get("cache-control"), await res.text()]).toEqual([403, "no-store", "You may not do that here."]);
    expect(exportMetricValues).not.toHaveBeenCalled();
    vi.mocked(currentActor).mockImplementationOnce(async () => redirect("/login"));
    await expect(get("metric=revenue")).rejects.toThrow("NEXT_REDIRECT");
    // A failure that is not a sentence for people stays an error.
    vi.mocked(currentActor).mockRejectedValueOnce(new TypeError("boom"));
    await expect(get("metric=revenue")).rejects.toThrow("boom");
  });
  it("says 403 to someone who may not, and the reason when the file cannot be made", async () => {
    vi.mocked(exportMetricValues).mockRejectedValueOnce(new Forbidden());
    expect(await get("metric=revenue")).toMatchObject({ status: 403 });
    vi.mocked(exportMetricValues).mockRejectedValueOnce(new Error("Pick at least one Metric you can see."));
    const res = await get("metric=revenue");
    expect([res.status, await res.text()]).toEqual([400, "Pick at least one Metric you can see."]);
    // A failure that is not a sentence for people is not shown.
    vi.mocked(exportMetricValues).mockRejectedValueOnce(new TypeError("boom"));
    await expect(get("metric=revenue")).rejects.toThrow("boom");
  });
});
