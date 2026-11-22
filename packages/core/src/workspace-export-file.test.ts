// The Workspace Export as bytes (GLOSSARY: Workspace Export): the writer and the reader round-trip a file, plain or
// gzipped, and the reader holds an untrusted stream to its limits while it reads. No database.
import { gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { WorkspaceExportRecord } from "@ziffr/pack/workspace-export";
import { readWorkspaceExport, readWorkspaceExportAll, WorkspaceExportProblem, writeWorkspaceExport, writeWorkspaceExportAll } from "./workspace-export-file";

const metric = { format: "ziffr.metric/1", name: "Orders", period: "month", aggregation: "sum", polarity: "higher" } as const;
const RECORDS: WorkspaceExportRecord[] = [
  { kind: "header", format: "ziffr.workspace-export/1", ziffr: "0.40.0", exportedAt: "2026-11-22T10:00:00Z", workspace: { name: "Acme Ünïcode 日本" } },
  { kind: "group", id: "g1", name: "Sales" },
  { kind: "person", id: "p1", name: "Ada", email: "ada@example.com", role: "member", groups: ["g1"] },
  { kind: "metric", id: "m1", key: "orders", metric, owner: "p1" },
  { kind: "target", metric: "m1", period: "2026-01-01", min: 1, max: 2 },
  { kind: "value", metric: "m1", period: "2026-01-01", value: 14.5, submittedBy: "Ada Lovelace", source: "web_form" },
  { kind: "value", metric: "m1", period: "2026-02-01", value: 15 },
];
const chunks = (b: Uint8Array, size: number) => Readable.from(Array.from({ length: Math.ceil(b.length / size) }, (_, i) => b.subarray(i * size, (i + 1) * size)));
const refused = async (input: AsyncIterable<Uint8Array>, limits?: { fileBytes: number; textBytes: number }) => {
  try {
    for await (const _ of readWorkspaceExport(input, limits)) void _;
  } catch (e) {
    expect(e).toBeInstanceOf(WorkspaceExportProblem);
    return (e as WorkspaceExportProblem).problems;
  }
  throw new Error("was not refused");
};

describe("write and read", () => {
  it("round-trips a file, plain and gzipped, with the end record the writer made", async () => {
    for (const gzip of [false, true]) {
      const file = await writeWorkspaceExportAll(RECORDS, { gzip });
      expect(file[0] === 0x1f).toBe(gzip);
      const read = await readWorkspaceExportAll(file);
      expect(read.map((r) => r.record).slice(0, -1)).toEqual(RECORDS);
      expect(read.at(-1)!.record).toMatchObject({ kind: "end", counts: { value: 2, metric: 1 } });
      expect(read.map((r) => r.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
  it("reads a file given in pieces that cut lines and characters in two", async () => {
    for (const gzip of [false, true]) {
      const file = await writeWorkspaceExportAll(RECORDS, { gzip });
      for (const size of [1, 3, 7, 64]) {
        const records: unknown[] = [];
        for await (const r of readWorkspaceExport(chunks(file, size))) records.push(r.record);
        expect(records, `${gzip} ${size}`).toHaveLength(RECORDS.length + 1);
      }
    }
  });
  it("streams: the writer yields before it has read every record", async () => {
    let made = 0;
    async function* source() {
      for (const r of RECORDS) {
        made++;
        yield r;
      }
    }
    const it = writeWorkspaceExport(source());
    await it.next();
    await it.next();
    expect(made).toBeLessThan(RECORDS.length);
  });
  it("refuses to write what the reader would refuse, and a record that is a secret", async () => {
    await expect(writeWorkspaceExportAll([RECORDS[0], { ...RECORDS[1], accessKey: "zf_live_abc" } as never])).rejects.toThrow(/never carries one/);
    await expect(writeWorkspaceExportAll([RECORDS[0], { kind: "value", metric: "nope", period: "2026-01-01", value: 1 }])).rejects.toThrow(/line 2/);
    await expect(writeWorkspaceExportAll([...RECORDS, { kind: "end", counts: {} } as never])).rejects.toThrow(/written by the writer/);
    await expect(writeWorkspaceExportAll(RECORDS.slice(1))).rejects.toThrow(/header/);
  });
});

describe("the reader on an untrusted stream", () => {
  const good = async () => new TextDecoder().decode(await writeWorkspaceExportAll(RECORDS));
  it("names the line of the first bad record and stops there", async () => {
    const lines = (await good()).split("\n");
    lines[2] = lines[2].replace("ada@example.com", "nobody");
    const problems = await refused(Readable.from([new TextEncoder().encode(lines.join("\n"))]));
    expect(problems[0]).toMatchObject({ line: 3, path: "email" });
  });
  it("notices a file cut off before its end", async () => {
    const lines = (await good()).split("\n");
    const problems = await refused(Readable.from([new TextEncoder().encode(lines.slice(0, 5).join("\n") + "\n")]));
    expect(problems[0].message).toContain("no end record");
  });
  it("notices a gzip file cut off", async () => {
    const file = await writeWorkspaceExportAll(RECORDS, { gzip: true });
    const problems = await refused(Readable.from([file.subarray(0, file.length - 10)]));
    expect(problems[0].message).toContain("gzip");
  });
  it("refuses a file over the size limit while reading, not after", async () => {
    let served = 0;
    async function* endless() {
      for (;;) {
        served += 1024;
        yield new Uint8Array(1024).fill(32);
      }
    }
    const problems = await refused(endless(), { fileBytes: 10_000, textBytes: 1e9 });
    expect(problems[0].message).toContain("larger than 10,000 bytes");
    expect(served).toBeLessThan(20_000);
  });
  it("refuses a zip bomb at the limit of the unzipped text, long before the whole is unzipped", async () => {
    const prefix = RECORDS.slice(0, 4).map((r) => JSON.stringify(r) + "\n").join("");
    const value = JSON.stringify({ kind: "value", metric: "m1", period: "2026-01-01", value: 1 }) + "\n";
    // 60 MB of sound value records: well under 1 MB zipped.
    const bomb = gzipSync(Buffer.from(prefix + value.repeat(Math.ceil((60 * 1024 * 1024) / value.length))));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const problems = await refused(Readable.from([bomb]), { fileBytes: 10 * 1024 * 1024, textBytes: 2 * 1024 * 1024 });
    expect(problems[0].message).toContain("text of the file is larger");
  });
  it("refuses a line that never ends", async () => {
    const problems = await refused(Readable.from([new TextEncoder().encode(JSON.stringify(RECORDS[0]) + "\n" + '{"kind":"group","name":"' + "x".repeat(2 * 1024 * 1024))]));
    expect(problems[0].message).toContain("A line is longer than");
    expect(problems[0].line).toBe(2);
  });
  it("refuses bytes that are not UTF-8, and a file that is not gzip though it starts like one", async () => {
    const bad = Buffer.concat([Buffer.from(JSON.stringify(RECORDS[0]) + "\n"), Buffer.from([0xff, 0xfe, 0x0a])]);
    expect((await refused(Readable.from([bad])))[0].message).toContain("UTF-8");
    expect((await refused(Readable.from([Buffer.from([0x1f, 0x8b, 0x00, 0x01, 0x02])])))[0].message).toContain("gzip");
  });
  it("accepts an empty stream as an empty file, which the format then refuses", async () => {
    expect((await refused(Readable.from([])))[0].message).toBe("The file is empty.");
  });
  it("does not let a hostile record pollute Object.prototype", async () => {
    const lines = (await good()).split("\n");
    lines[1] = '{"kind":"group","id":"g1","name":"A","__proto__":{"admin":true}}';
    await refused(Readable.from([new TextEncoder().encode(lines.join("\n"))]));
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});
