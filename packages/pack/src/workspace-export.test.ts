// The Workspace Export format's checks (GLOSSARY: Workspace Export): a sound file, what it carries, and hostile files.
import { describe, expect, it } from "vitest";
import { checkWorkspaceExport, WORKSPACE_EXPORT_LIMITS, WORKSPACE_EXPORT_SCHEMA, WorkspaceExportChecker } from "./workspace-export.js";

const metricDoc = { format: "ziffr.metric/1", name: "Orders", period: "month", aggregation: "sum", polarity: "higher" };
const themeDoc = { format: "ziffr.theme/1", name: "Calm", colors: { canvas: "#ffffff", surface: "#f5f5f5", ink: "#111111", muted: "#777777", rule: "#dddddd", accent: "#2255ee", good: "#118833", bad: "#cc2222", band: "#e6eeff", data: ["#2255ee"] }, fonts: { heading: "inter", body: "inter", figures: "inter" }, radius: 6, cards: "flat" };
const dashDoc = { format: "ziffr.dashboard-template/1", name: "Sales", slots: [{ label: "Orders" }], widgets: [{ view: "number", slots: [0], x: 0, y: 0, w: 4, h: 3 }] };
const flowDoc = { format: "ziffr.workflow-template/1", name: "Monthly", dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 1 }, { type: "publish", lock: false }] };
const deckDoc = { format: "ziffr.deck-template/1", name: "Review", slots: [{ label: "Orders" }], slides: [{ shapes: [{ shape: "text", x: 10, y: 10, w: 300, text: ["Hello"] }] }] };

const RECORDS: Record<string, unknown>[] = [
  { kind: "header", format: "ziffr.workspace-export/1", ziffr: "0.40.0", exportedAt: "2026-11-22T10:00:00Z", workspace: { name: "Acme", timeZone: "Europe/Berlin", language: "en" } },
  { kind: "group", id: "g1", name: "Sales team" },
  { kind: "theme", id: "t1", theme: themeDoc },
  { kind: "person", id: "p1", name: "Ada Lovelace", email: "ada@example.com", role: "admin", groups: ["g1"] },
  { kind: "metric", id: "m1", key: "orders", metric: metricDoc, tags: ["sales"], owner: "p1", submitters: ["p1"] },
  { kind: "metric", id: "m2", key: "revenue", metric: { ...metricDoc, name: "Revenue" } },
  { kind: "metric", id: "m3", key: "avg", metric: { ...metricDoc, name: "Average", aggregation: "average", formula: "{revenue} / {orders}" } },
  { kind: "dashboard", id: "d1", dashboard: dashDoc, slots: [["m1"]] },
  { kind: "deck", id: "k1", deck: deckDoc, slots: [["m1"]], theme: "t1" },
  { kind: "workflow", id: "w1", workflow: flowDoc, metrics: ["m1", "m2"] },
  { kind: "share", of: { kind: "dashboard", id: "d1" }, with: { kind: "group", id: "g1" } },
  { kind: "target", metric: "m1", period: "2026-01-01", min: 10, max: 20 },
  { kind: "projection", metric: "m1", period: "2027-01-01", value: 12.5 },
  { kind: "value", metric: "m1", period: "2026-01-01", value: 14, recordedAt: "2026-02-01T08:00:00Z", source: "web_form", submittedBy: "Ada Lovelace", breakdown: [{ label: "Germany", value: 9 }, { label: "France", value: 5 }] },
  { kind: "end", counts: { group: 1, theme: 1, person: 1, metric: 3, dashboard: 1, deck: 1, workflow: 1, share: 1, target: 1, projection: 1, value: 1 } },
];
const text = (rs: unknown[]) => rs.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n") + "\n";
const without = (kind: string, rs = RECORDS) => rs.filter((r) => r.kind !== kind);
/** The records with the one at `i` changed. */
const edit = (i: number, f: (r: Record<string, unknown>) => Record<string, unknown>) => RECORDS.map((r, n) => (n === i ? f({ ...r }) : r));
const at = (kind: string, n = 0) => RECORDS.map((r, i) => [r, i] as const).filter(([r]) => r.kind === kind)[n][1];
const problems = (t: string) => {
  const r = checkWorkspaceExport(t);
  return r.ok ? [] : r.problems;
};
const messages = (t: string) => problems(t).map((p) => `${p.line}:${p.path} ${p.message}`);

describe("a sound Workspace Export", () => {
  it("passes, with its counts", () => {
    const r = checkWorkspaceExport(text(RECORDS));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.records).toBe(RECORDS.length);
      expect(r.counts.value).toBe(1);
      expect(r.header.workspace.name).toBe("Acme");
    }
  });
  it("reads CRLF line ends and a leading byte order mark", () => {
    expect(checkWorkspaceExport("﻿" + text(RECORDS).replace(/\n/g, "\r\n")).ok).toBe(true);
  });
  it("is held to by the published schema: every kind is a branch", () => {
    expect(WORKSPACE_EXPORT_SCHEMA.oneOf).toHaveLength(13);
  });
  it("names the line of each problem", () => {
    const t = text(edit(at("person"), (r) => ({ ...r, email: "not an address" })));
    expect(problems(t)).toEqual([{ path: "email", line: 4, message: "is not allowed here." }].map((p) => expect.objectContaining({ path: p.path, line: p.line })));
  });
});

describe("the order and the references", () => {
  it("needs a header first, and only once", () => {
    expect(messages(text(RECORDS.slice(1)))[0]).toContain("1:kind The first line of a Workspace Export is its header.");
    expect(messages(text([RECORDS[0], RECORDS[0], ...RECORDS.slice(1)]))[0]).toContain("2:kind A second header");
  });
  it("refuses a record that comes before what it names, and one out of order", () => {
    const swapped = [...RECORDS];
    [swapped[at("metric")], swapped[at("person")]] = [swapped[at("person")], swapped[at("metric")]];
    expect(messages(text(swapped)).join("\n")).toContain("comes after records that must follow it");
  });
  it("refuses a dangling reference of every kind", () => {
    for (const [i, field, value] of [
      [at("person"), "groups", ["nope"]],
      [at("metric"), "owner", "nope"],
      [at("metric"), "submitters", ["nope"]],
      [at("dashboard"), "slots", [["nope"]]],
      [at("deck"), "theme", "nope"],
      [at("workflow"), "metrics", ["nope"]],
    ] as const) {
      const out = messages(text(edit(i, (r) => ({ ...r, [field]: value }))));
      expect(out.join("\n"), field).toContain("names “nope”");
    }
    expect(messages(text(edit(at("share"), (r) => ({ ...r, with: { kind: "group", id: "nope" } })))).join()).toContain("names “nope”");
    expect(messages(text(edit(at("value"), (r) => ({ ...r, metric: "nope" })))).join()).toContain("names “nope”");
    expect(messages(text(edit(at("target"), (r) => ({ ...r, metric: "nope" })))).join()).toContain("names “nope”");
  });
  it("refuses a label used twice and an id of another Workspace shaped like a row id (read as a label, not as a row)", () => {
    expect(messages(text([...RECORDS.slice(0, 2), RECORDS[1], ...RECORDS.slice(2)])).join()).toContain("another group");
    expect(problems(text(edit(at("group"), (r) => ({ ...r, id: "../other" })))).length).toBeGreaterThan(0);
    expect(problems(text(edit(at("group"), (r) => ({ ...r, id: "x".repeat(65) })))).length).toBeGreaterThan(0);
  });
  it("refuses two Metrics with one key, two people with one address, and a Share listed twice", () => {
    expect(messages(text(edit(at("metric", 1), (r) => ({ ...r, key: "orders" })))).join()).toContain("key of the Metric on line");
    const dupe = [...RECORDS];
    dupe.splice(at("person") + 1, 0, { ...RECORDS[at("person")], id: "p2", email: "ADA@example.com" });
    expect(messages(text(dupe)).join()).toContain("address of another person");
    const twice = [...RECORDS];
    twice.splice(at("share") + 1, 0, RECORDS[at("share")]);
    expect(messages(text(twice)).join()).toContain("shared with already");
  });
  it("checks a Derived Metric's formula against the Metrics of the file, wherever they are listed", () => {
    expect(messages(text(edit(at("metric", 2), (r) => ({ ...r, metric: { ...(r.metric as object), formula: "{ghost} / {orders}" } })))).join()).toContain("{ghost}");
  });
  it("checks that a Slot is filled by as many Metrics as it takes", () => {
    expect(messages(text(edit(at("dashboard"), (r) => ({ ...r, slots: [["m1", "m2"]] })))).join()).toContain("takes one Metric");
    expect(messages(text(edit(at("dashboard"), (r) => ({ ...r, slots: [["m1"], ["m1"]] })))).join()).toContain("has 2 entries");
  });
});

describe("a file that is cut off or padded", () => {
  it("needs its end record, and its counts must be true", () => {
    expect(messages(text(without("end"))).join()).toContain("no end record");
    expect(messages(text(edit(RECORDS.length - 1, (r) => ({ ...r, counts: { ...(r.counts as object), value: 2 } })))).join()).toContain("counts.value says 2 but the file holds 1");
  });
  it("allows nothing after the end", () => {
    expect(messages(text([...RECORDS, RECORDS[1]])).join()).toContain("more after the end record");
  });
  it("refuses an empty file and an empty line", () => {
    expect(problems("")[0].message).toBe("The file is empty.");
    expect(messages(text([RECORDS[0], "", ...RECORDS.slice(1)]))[0]).toContain("2: This line is empty");
  });
});

describe("what is never carried", () => {
  const secrets = ["accessKey", "feedKey", "workspaceKey", "secret", "ciphertext", "webhookUrl", "connector", "slackToken", "telegramChatId", "password", "wrappedKey", "keyId", "apiToken"];
  it.each(secrets)("refuses a field called %s, in words, on any record", (field) => {
    for (const kind of ["header", "person", "metric", "value", "group"]) {
      const i = at(kind);
      const out = messages(text(edit(i, (r) => ({ ...r, [field]: "x" }))));
      expect(out.join(), `${kind} ${field}`).toContain("never carries one");
    }
  });
  it("refuses a Metric's own `key` only where it is not a field, and keeps it where it is", () => {
    expect(checkWorkspaceExport(text(RECORDS)).ok).toBe(true);
    expect(messages(text(edit(at("group"), (r) => ({ ...r, key: "orders" })))).join()).toContain("never carries one");
  });
  it("refuses any other unknown field, nested or not", () => {
    expect(messages(text(edit(at("group"), (r) => ({ ...r, color: "red" })))).join()).toContain("is not a field here");
    expect(messages(text(edit(at("value"), (r) => ({ ...r, note: "x" })))).join()).toContain("is not a field here");
    expect(messages(text(edit(at("metric"), (r) => ({ ...r, metric: { ...metricDoc, owner: "x" } })))).join()).toContain("metric.owner is not a field here");
    expect(messages(text(edit(0, (r) => ({ ...r, workspace: { name: "A", logo: "data:x" } })))).join()).toContain("workspace.logo is not a field here");
  });
  it("takes any text a person typed as data, but no control or direction characters, and holds a Pack's items to the Pack's rules", () => {
    for (const name of ["<b>x</b>", "https://evil.example/x", "{{x}}", "R&D @ home 🚀"]) expect(problems(text(edit(at("group"), (r) => ({ ...r, name })))), name).toHaveLength(0);
    for (const bad of ["line\nbreak", "tab\there", "a\u0000b", "a\u202Eb", "a\u2028b", "a\u2067b", "a\u200Fb"]) {
      expect(problems(text(edit(at("group"), (r) => ({ ...r, name: bad })))), JSON.stringify(bad)).not.toHaveLength(0);
      expect(problems(text(edit(at("value"), (r) => ({ ...r, submittedBy: bad })))), JSON.stringify(bad)).not.toHaveLength(0);
    }
    expect(problems(text(edit(at("dashboard"), (r) => ({ ...r, dashboard: { ...dashDoc, name: "<b>x</b>" } }))))).not.toHaveLength(0);
  });
  it("refuses a Theme that brings a logo, and a dashboard that names an item of a Pack", () => {
    expect(messages(text(edit(at("theme"), (r) => ({ ...r, theme: { ...themeDoc, slides: { logo: "pack" } } })))).join()).toContain("theme.slides.logo");
    expect(messages(text(edit(at("dashboard"), (r) => ({ ...r, dashboard: { ...dashDoc, slots: [{ label: "Orders", suggests: "orders" }] } })))).join()).toContain("only a Pack holding it can give");
  });
});

describe("hostile files", () => {
  it("refuses a line over the limit, before it is walked", () => {
    const big = JSON.stringify({ kind: "group", id: "g1", name: "x".repeat(WORKSPACE_EXPORT_LIMITS.lineBytes) });
    expect(messages(text([RECORDS[0], big]))[0]).toContain("bytes; at most");
  });
  it("refuses deep nesting", () => {
    const deep = '{"kind":"group","id":"g1","name":' + "[".repeat(40) + "]".repeat(40) + "}";
    expect(messages(text([RECORDS[0], deep]))[0]).toContain("nested more than");
  });
  it("reads __proto__, constructor and prototype as data, never as a prototype", () => {
    const pollute = '{"kind":"group","id":"g1","name":"A","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
    const out = messages(text([RECORDS[0], pollute]));
    expect(out.join()).toContain("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // As a label or a key it is refused by pattern, and held in Maps so it could not pollute anyway.
    expect(problems(text(edit(at("group"), (r) => ({ ...r, id: "__proto__" }))))).not.toHaveLength(0);
    expect(problems(text(edit(at("metric"), (r) => ({ ...r, key: "__proto__" }))))).not.toHaveLength(0);
    const twice = '{"kind":"group","id":"g1","id":"g2","name":"A"}';
    expect(messages(text([RECORDS[0], twice]))[0]).toContain("given twice");
  });
  it("refuses huge, infinite and over-precise numbers, and numbers that are not numbers", () => {
    const v = (value: unknown) => text(edit(at("value"), (r) => ({ ...r, value })));
    expect(problems(v(1e31))).not.toHaveLength(0);
    expect(problems(v(-1e300))).not.toHaveLength(0);
    expect(problems(text(RECORDS.map((r) => JSON.stringify(r)).map((l) => (l.includes('"value":14') ? l.replace('"value":14', '"value":1e999') : l))))).not.toHaveLength(0);
    expect(problems(text(RECORDS.map((r) => JSON.stringify(r)).map((l) => (l.includes('"value":14') ? l.replace('"value":14', '"value":9' + "9".repeat(80)) : l))))).not.toHaveLength(0);
    expect(messages(v(0.123456789)).join()).toContain("more than 8 decimals");
    expect(problems(v("14"))).not.toHaveLength(0);
    expect(problems(v(null))).not.toHaveLength(0);
    expect(problems(text(RECORDS.map((r) => JSON.stringify(r)).map((l) => (l.includes('"value":14') ? l.replace('"value":14', '"value":NaN') : l))))).not.toHaveLength(0);
    expect(problems(v(14.25))).toHaveLength(0);
  });
  it("refuses invalid and out-of-range dates and moments", () => {
    const p = (period: string) => text(edit(at("value"), (r) => ({ ...r, period })));
    for (const bad of ["2026-02-30-", "2026-13-01", "2026-00-10", "0000-01-01", "1800-01-01", "2300-01-01", "2026-1-1", "20260101", "2026-01-01T00:00:00Z", ""]) expect(problems(p(bad)), bad).not.toHaveLength(0);
    expect(messages(p("2026-02-30")).join()).toContain("not a real day");
    expect(messages(p("2026-01-15")).join()).toContain("does not start a month");
    const t = (recordedAt: string) => text(edit(at("value"), (r) => ({ ...r, recordedAt })));
    for (const bad of ["2026-02-30T00:00:00Z", "2026-01-01T25:00:00Z", "2026-01-01T00:61:00Z", "2026-01-01 00:00:00Z", "2026-01-01T00:00:00+02:00", "yesterday"]) expect(problems(t(bad)), bad).not.toHaveLength(0);
    expect(problems(text(edit(0, (r) => ({ ...r, exportedAt: "2026-02-31T00:00:00Z" }))))).not.toHaveLength(0);
    expect(problems(text(edit(0, (r) => ({ ...r, workspace: { name: "A", timeZone: "Mars/Olympus" } }))))).not.toHaveLength(0);
  });
  it("refuses a Target Range that is backwards or empty, and a Breakdown label twice", () => {
    expect(messages(text(edit(at("target"), (r) => ({ ...r, min: 30 })))).join()).toContain("above max");
    expect(messages(text(edit(at("target"), (r) => ({ kind: "target", metric: r.metric, period: r.period })))).join()).toContain("needs “min”");
    expect(messages(text(edit(at("value"), (r) => ({ ...r, breakdown: [{ label: "A", value: 1 }, { label: "A", value: 2 }] })))).join()).toContain("names a label twice");
  });
  it("refuses a newer format by name, an unknown record and a wrong kind", () => {
    expect(messages(text(edit(0, (r) => ({ ...r, format: "ziffr.workspace-export/2" }))))[0]).toContain("This file is in format ziffr.workspace-export/2; this Ziffr reads ziffr.workspace-export/1");
    expect(messages(text(edit(at("group"), (r) => ({ ...r, kind: "alert" }))))[0]).toContain("is not a record this Ziffr reads");
    expect(messages(text([RECORDS[0], "[]"]))[0]).toContain("must be an object");
    expect(messages(text([RECORDS[0], '{"id":"x"}']))[0]).toContain("needs the field “kind”");
    expect(messages(text([RECORDS[0], "not json"]))[0]).toContain("2:");
  });
  it("refuses more records of a kind than a Workspace can have, and says so once per record", () => {
    const c = new WorkspaceExportChecker();
    c.line(JSON.stringify(RECORDS[0]));
    let last: ReturnType<typeof c.line> | undefined;
    for (let i = 0; i <= WORKSPACE_EXPORT_LIMITS.perKind.group; i++) last = c.line(JSON.stringify({ kind: "group", id: `g${i}`, name: `Group ${i}` }));
    expect(last && !last.ok && last.problems[0].message).toContain("more than 1,000");
  });
  it("keeps the problems of a file with many mistakes to the first 50", () => {
    const many = [RECORDS[0], ...Array.from({ length: 200 }, (_, i) => ({ kind: "group", id: `g${i}`, name: "x", color: "red" }))];
    expect(problems(text(many))).toHaveLength(50);
  });
  it("holds a lot of values with a bounded memory: only labels are kept", () => {
    const c = new WorkspaceExportChecker();
    for (const r of RECORDS.slice(0, at("value"))) expect(c.line(JSON.stringify(r)).ok).toBe(true);
    for (let i = 0; i < 20_000; i++) expect(c.line(JSON.stringify({ kind: "value", metric: "m1", period: "2026-01-01", value: i })).ok).toBe(true);
    expect(c.recordCounts.value).toBe(20_000);
  });
  it("does not stall on a long text that almost matches the address pattern", () => {
    const started = Date.now();
    problems(text(edit(at("person"), (r) => ({ ...r, email: "a@" + "a.".repeat(120) + "b", name: "x ".repeat(55) }))));
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("counts periods from the Workspace's year start, and weeks from Monday", () => {
    const withYear = (yearStart: number, period: string, metricPeriod: string) => {
      const rs = edit(0, (r) => ({ ...r, workspace: { name: "A", yearStart } }));
      rs[at("metric")] = { ...RECORDS[at("metric")], metric: { ...metricDoc, period: metricPeriod } };
      rs[at("value")] = { ...RECORDS[at("value")], period };
      return problems(text(rs.filter((r) => r.kind !== "target" && r.kind !== "projection").map((r) => (r.kind === "end" ? { ...r, counts: { ...(r.counts as object), target: 0, projection: 0 } } : r)))).filter((p) => p.path === "period");
    };
    expect(withYear(2, "2026-02-01", "quarter")).toHaveLength(0);
    expect(withYear(2, "2026-05-01", "quarter")).toHaveLength(0);
    expect(withYear(2, "2026-04-01", "quarter")).toHaveLength(1);
    expect(withYear(2, "2026-02-01", "year")).toHaveLength(0);
    expect(withYear(1, "2026-02-01", "year")).toHaveLength(1);
    expect(withYear(1, "2026-01-07", "week")).toHaveLength(1);
    expect(withYear(1, "2026-01-05", "week")).toHaveLength(0);
    expect(problems(text(edit(0, (r) => ({ ...r, workspace: { name: "A", yearStart: 13 } }))))).not.toHaveLength(0);
  });
  it("lists targets and projections once each, in rising order", () => {
    const dup = [...RECORDS];
    dup.splice(at("target") + 1, 0, RECORDS[at("target")]);
    expect(messages(text(dup)).join()).toContain("comes at or before the target");
    const back = [...RECORDS];
    back.splice(at("projection") + 1, 0, { ...RECORDS[at("projection")], period: "2026-06-01" });
    expect(messages(text(back)).join()).toContain("comes at or before the projection");
  });
  it("checks 10,000 formulas in a moment", () => {
    const rs: Record<string, unknown>[] = [RECORDS[0]];
    for (let i = 0; i < 10_000; i++) rs.push({ kind: "metric", id: `m${i}`, key: `k${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}${String.fromCharCode(97 + (Math.floor(i / 676) % 26))}`, metric: { ...metricDoc, formula: "{ghost} + 1" } });
    rs.push({ kind: "end", counts: { ...(RECORDS.at(-1)!.counts as object), group: 0, theme: 0, person: 0, metric: 10_000, dashboard: 0, deck: 0, workflow: 0, share: 0, target: 0, projection: 0, value: 0 } });
    const started = Date.now();
    expect(problems(text(rs)).length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
