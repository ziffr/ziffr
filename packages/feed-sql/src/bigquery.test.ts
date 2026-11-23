// The BigQuery driver without a network: a hand-written fake client records what would be sent (spec 0048, #910).
import { describe, expect, it } from "vitest";
import { checkConfig } from "./index";
import { checkSelect, connect, DEFAULT_MAX_BYTES_BILLED } from "./bigquery";

function fake(bytes: string, statementType = "SELECT") {
  const jobs: Record<string, unknown>[] = [];
  const seen: { projectId?: string } = {};
  class BigQuery {
    constructor(o: { projectId: string }) { seen.projectId = o.projectId; }
    async createQueryJob(o: Record<string, unknown>) {
      jobs.push(o);
      return [{ metadata: { statistics: { totalBytesProcessed: bytes, query: { statementType } } }, getQueryResults: async () => [[{ v: 42 }]] }] as never;
    }
  }
  return { jobs, seen, load: async () => ({ BigQuery }) };
}
const dates = ["2026-01-01", "2026-02-01"];

describe("bigquery connect", () => {
  it("binds the dates as DATE parameters, dry-runs first and passes the cap to the real job", async () => {
    const f = fake("1000");
    const db = await connect({ project: "p", max_bytes_billed: 5000 }, {}, f.load);
    expect(await db.query("select 1 where d >= @period_start and d < @period_end", dates)).toEqual([{ v: 42 }]);
    expect(f.jobs).toHaveLength(2);
    expect(f.jobs[0]).toMatchObject({ dryRun: true, params: { period_start: dates[0], period_end: dates[1] }, types: { period_start: "DATE", period_end: "DATE" } });
    expect(f.jobs[0].query).not.toContain("2026");
    expect(f.jobs[1]).toMatchObject({ maximumBytesBilled: "5000", jobTimeoutMs: 60_000, types: { period_start: "DATE" } });
    expect(f.jobs[1].dryRun).toBeUndefined();
  });
  it("refuses above the cap, naming both numbers, and runs no real job", async () => {
    const f = fake("6000");
    const db = await connect({ project: "p", max_bytes_billed: 5000 }, {}, f.load);
    await expect(db.query("select 1", dates)).rejects.toThrow(/6000 bytes.*5000 bytes/);
    expect(f.jobs).toHaveLength(1);
  });
  it("defaults the cap to 10 GB", async () => {
    const f = fake("1");
    await (await connect({ project: "p" }, {}, f.load)).query("select 1", dates);
    expect(f.jobs[1].maximumBytesBilled).toBe(String(DEFAULT_MAX_BYTES_BILLED));
    expect(DEFAULT_MAX_BYTES_BILLED).toBe(10_737_418_240);
  });
  it("refuses what is not one select, before any call", async () => {
    const f = fake("1");
    const db = await connect({ project: "p" }, {}, f.load);
    for (const q of ["delete from t where true", "select 1; select 2", "select 1; drop table t", "insert into t values (1)"]) await expect(db.query(q, dates)).rejects.toThrow(/SELECT|single statement/);
    expect(f.jobs).toHaveLength(0);
  });
  it("refuses when the dry run reports another statement type", async () => {
    const f = fake("1", "SCRIPT");
    await expect((await connect({ project: "p" }, {}, f.load)).query("with a as (select 1) select * from a", dates)).rejects.toThrow(/SCRIPT/);
  });
  it("takes the project from the file, else GOOGLE_CLOUD_PROJECT, else says so", async () => {
    const a = fake("1");
    await connect({ project: "from-file" }, { GOOGLE_CLOUD_PROJECT: "from-env" }, a.load);
    expect(a.seen.projectId).toBe("from-file");
    const b = fake("1");
    await connect({}, { GOOGLE_CLOUD_PROJECT: "from-env" }, b.load);
    expect(b.seen.projectId).toBe("from-env");
    await expect(connect({}, {}, b.load)).rejects.toThrow(/project/);
  });
  it("closes without error and names the package when it is missing", async () => {
    await expect((await connect({ project: "p" }, {}, fake("1").load)).close()).resolves.toBeUndefined();
    const missing = async () => { throw Object.assign(new Error("x"), { code: "ERR_MODULE_NOT_FOUND" }); };
    await expect(connect({ project: "p" }, {}, missing)).rejects.toThrow(/npm install @google-cloud\/bigquery/);
  });
});

describe("checkSelect", () => {
  it("ignores comments, quoted text and one trailing semicolon", () => {
    expect(() => checkSelect("-- hi\nselect ';' as a, \"x;\" /* ; */ from t;")).not.toThrow();
  });
});

describe("checkConfig for BigQuery", () => {
  const base = { name: "W", dialect: "bigquery", metrics: { a: { value: "select 1" } } };
  it("takes project and max_bytes_billed and refuses bad ones", () => {
    expect(checkConfig({ ...base, project: "p", max_bytes_billed: 1 })).toBeTruthy();
    expect(() => checkConfig({ ...base, max_bytes_billed: -1 })).toThrow(/max_bytes_billed/);
    expect(() => checkConfig({ ...base, project: "" })).toThrow(/project/);
  });
});
