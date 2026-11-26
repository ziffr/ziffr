// Every CSV file Ziffr hands a person starts with the UTF-8 byte-order mark, once, and Ziffr's own CSV readers take such
// a file as they take one without it. Who may download and what is in a file is the core's; here it stands in.
import { describe, expect, it, vi } from "vitest";
import { readPaste, type PasteContext } from "@ziffr/core/paste-reader";
import { parseBreakdown } from "@ziffr/core/parse";
import { readFile } from "@/app/paste-values/read-file";
import { CSV_BYTE_ORDER_MARK, csvFile } from "./csv-file";

const CSV = '"metric";"name"\r\n"umsatz";"Umsätze in Österreich"\r\n';

vi.mock("@/lib/viewer", () => ({ currentActor: vi.fn(async () => ({ personId: "p", workspaceId: "w", role: "owner" })) }));
vi.mock("@ziffr/core/unused-workspaces", () => ({ workspaceValuesCsv: async () => CSV }));
vi.mock("@ziffr/core/trial-end", () => ({ trialValuesCsv: async () => CSV }));
vi.mock("@ziffr/core/retention-setting", () => ({ retentionValuesCsv: async () => CSV }));
vi.mock("@ziffr/core/metric-values-export", () => ({ EXPORT_METRICS: 50, exportMetricValues: async () => ({ csv: CSV, metrics: 1, rows: 1 }) }));
vi.mock("@ziffr/core/audit-log", () => ({
  AuditExportLimit: class extends Error {},
  // Two batches, as the log is streamed.
  exportAuditLog: async () => ({ filename: "audit-log.csv", lines: (async function* () { yield CSV.slice(0, 17); yield CSV.slice(17); })() }),
}));

import { GET as audit } from "@/app/audit/export/route";
import { GET as metricValues } from "@/app/metric-values/route";
import { GET as retention } from "@/app/retention-values/route";
import { GET as workspaceValues } from "@/app/settings/workspace/download/route";
import { GET as trialValues } from "@/app/try/download/route";

const request = (path: string) => new Request(`http://ziffr.test${path}`);

describe("a CSV download", () => {
  it.each([
    ["the chosen Metrics' values", () => metricValues(request("/metric-values?metric=umsatz"))],
    ["the Workspace's values", () => workspaceValues()],
    ["a trial's values", () => trialValues()],
    ["the values a Retention would delete", () => retention(request("/retention-values?metric=1&keep=36&then=delete"))],
    ["the Audit Log", () => audit(request("/audit/export"))],
  ])("of %s starts with the byte-order mark, once, and keeps its letters", async (_what, download) => {
    const res = await download();
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // Kept as it is written, so a second mark would show.
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(CSV_BYTE_ORDER_MARK + CSV);
  });
});

const CTX: PasteContext = {
  style: "1.234,5", today: "2026-11-26", yearStart: 1, languages: ["de"],
  metrics: [{ id: 1, slug: "umsatz", name: "Umsätze", period: "month", unit: "€", format: "currency" }],
};

describe("Ziffr's own CSV readers", () => {
  it.each([
    ["semicolons, quoted", '"metric";"period";"value"\r\n"Umsätze";"2026-10-01";"1200,5"\r\n'],
    ["semicolons", "metric;period;value\r\numsatz;2026-10-01;1200,5\r\n"],
    ["commas, quoted", '"metric","period","value"\r\n"umsatz","2026-10-01","1200"\r\n'],
  ])("Paste values reads a file with the mark as one without it (%s)", async (_how, csv) => {
    const plain = readPaste(csv, CTX);
    expect(plain.ok && plain.values.map((v) => v.metricId)).toEqual([1]);
    const dropped = await readFile(new File([csvFile(csv)], "werte.csv", { type: "text/csv" }));
    expect(dropped.ok && dropped.text).toBe(csv);
    // Also when the mark arrives with the text, as it may from a clipboard.
    expect(readPaste(csvFile(csv), CTX)).toEqual(plain);
  });

  it.each([
    ["a header with a parent column", '"label","value","parent"\r\n"Österreich","12",""\r\n"Wien","5","Österreich"\r\n'],
    ["no header", '"Österreich",12\r\n"Schweiz",5\r\n'],
  ])("a Breakdown reads a file with the mark as one without it (%s)", async (_how, csv) => {
    const plain = parseBreakdown(csv, "1,234.5", { parents: true });
    expect(plain?.rows.length).toBe(2);
    expect(parseBreakdown(csvFile(csv), "1,234.5", { parents: true })).toEqual(plain);
    expect(parseBreakdown(await new File([csvFile(csv)], "teile.csv").text(), "1,234.5", { parents: true })).toEqual(plain);
  });
});
