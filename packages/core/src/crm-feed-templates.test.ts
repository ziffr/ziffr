// The CRM sales forecast templates (docs/automations, spec 0043; GLOSSARY: Automation Template, Feed, Metric): HubSpot,
// Salesforce and Pipedrive figures for the week that has just ended. Their Code nodes are run as n8n runs them, against
// answers written after each CRM's API description, and the expressions of their requests are worked out the same way.
// No n8n and no CRM account is used: whether the CRMs answer like this is tried by hand (each guide says if it was).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";

type Param = Record<string, unknown>;
type N8nNode = { name: string; type: string; parameters: Param; executeOnce?: boolean; onError?: string };
type Workflow = { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }>; settings: { timezone?: string } };
type Item = { json: Param };
type Nodes = Record<string, Item[]>;

const load = (crm: string) => JSON.parse(readFileSync(repoFile(`docs/automations/${crm}-forecast-feed.json`), "utf8")) as Workflow;
const nodeOf = (wf: Workflow, name: string) => wf.nodes.find((n) => n.name === name)!;
const one = (json: Param): Item[] => [{ json }];
const CRMS = ["hubspot", "salesforce", "pipedrive"] as const;

/** A Date whose "now" is `at`, as the Code nodes see it. */
function clockAt(at: string) {
  const now = Date.parse(at);
  return class extends Date {
    constructor(...a: unknown[]) { if (a.length) super(...(a as [number])); else super(now); }
    static now() { return now; }
  };
}
/** Runs one Code node as n8n does: an async function with `$` and `$input`. */
async function run(wf: Workflow, name: string, nodes: Nodes, o: { input?: Item[]; at?: string } = {}): Promise<Item[]> {
  const input = o.input ?? [{ json: {} }];
  const sandbox = { $: (n: string) => ({ first: () => nodes[n][0], all: () => nodes[n] }), $input: { first: () => input[0], all: () => input }, Date: clockAt(o.at ?? MONDAY) };
  return (vm.runInNewContext(`(async function(){${nodeOf(wf, name).parameters.jsCode}})`, sandbox) as () => Promise<Item[]>)();
}
/** The value an n8n expression "={{ … }}" stands for, given what the earlier nodes handed over. */
function worked(value: unknown, nodes: Nodes): string {
  const text = String(value);
  return text.replace(/^=/, "").replace(/\{\{([\s\S]*?)\}\}(?!\})/g, (_, code: string) => String(vm.runInNewContext(code, { $: (n: string) => ({ first: () => nodes[n][0] }) })));
}

// Monday 5 October 2026, noon UTC: the week of 28 September has ended. It starts in the third quarter.
const MONDAY = "2026-10-05T12:00:00Z";
// Monday 19 October 2026: the week of 12 October, in the fourth quarter.
const MID_QUARTER = "2026-10-19T12:00:00Z";
const WEEK = "2026-10-12";
const overview = (o: { yearStart?: number; metrics?: Param[] } = {}) => one({ name: "CRM", year_start_month: o.yearStart ?? 1, metrics: { items: o.metrics ?? [], next: null } });
const TEAM = { closedMetric: "closed", pipelineMetric: "pipeline", commitMetric: "commit", bestCaseMetric: "best-case" };
const settings = (o: Param = {}) => one({ ziffrUrl: "https://z.example", timeZone: "Europe/Berlin", currency: "eur", instanceUrl: "https://acme.my.salesforce.com", ...TEAM, ...o });

/** The whole run after the reads: Week, Figures and the shared Shape values; `items` is what would be sent. */
async function flow(crm: string, reads: Nodes, o: { settings?: Param; owners?: Param[]; at?: string; metrics?: Param[] } = {}) {
  const wf = load(crm);
  const at = o.at ?? MID_QUARTER;
  const nodes: Nodes = { Settings: settings(o.settings), "What is filled": overview({ metrics: o.metrics }), Owners: one({ owners: o.owners ?? [] }), ...reads };
  nodes.Week = await run(wf, "Week", nodes, { at });
  const figures = await run(wf, "Figures", nodes, { at });
  const out = await run(wf, "Shape values", nodes, { input: figures, at });
  return {
    items: (out[0]?.json.items ?? []) as { metric: string; period: string; value: number }[],
    notes: (figures[0].json.skipped as { why: string }[]).map((n) => n.why).join(" | "),
    sent: out,
  };
}
const values = (r: { items: { metric: string; value: number }[] }) => Object.fromEntries(r.items.map((i) => [i.metric, i.value]));

// ---- what each CRM answers ----
const OPTIONS = ["OMIT", "PIPELINE", "BEST_CASE", "MOST_LIKELY", "COMMIT", "CLOSED"].map((value) => ({ value, label: value }));
const deal = (id: string, owner: string, home: string, category = "PIPELINE", extra: Param = {}) => ({ id, properties: { amount_in_home_currency: home, amount: home, hubspot_owner_id: owner, hs_manual_forecast_category: category, dealname: "SECRET Corp", ...extra } });
/** HubSpot: won deals over two pages, open deals on one. Owner 11 won 100 and 50; open: 200 commit, 300 best case, 400 pipeline, 25 omitted. */
const hubspot = (o: { won?: Param[]; open?: Param[]; options?: unknown } = {}): Nodes => ({
  "Read won deals": o.won?.map((json) => ({ json })) ?? [
    { json: { total: 3, results: [deal("1", "11", "100"), deal("2", "11", "50.25")], paging: { next: { after: "2" } } } },
    { json: { total: 3, results: [deal("3", "22", "1000")] } },
  ],
  "Read open deals": o.open?.map((json) => ({ json })) ?? one({ total: 4, results: [deal("4", "11", "200", "COMMIT"), deal("5", "22", "300", "BEST_CASE"), deal("6", "22", "400"), deal("7", "11", "25", "OMIT")] }),
  "Read forecast categories": one("options" in o ? { options: o.options } : { options: OPTIONS }),
});

const total = (OwnerId: string, amountSum: number | null, extra: Param = {}) => ({ OwnerId, amountSum, dealCount: 2, pricedCount: 2, ...extra });
const ANA = "005000000000001AAA";
const BEN = "005000000000002AAA";
/** Salesforce: grouped totals. */
const salesforce = (o: { won?: Param[]; open?: Param[]; done?: boolean } = {}): Nodes => ({
  "Read won totals": one({ done: o.done ?? true, totalSize: 2, records: o.won ?? [total(ANA, 150.25), total(BEN, 1000)] }),
  "Read open totals": one({ done: true, records: o.open ?? [total(ANA, 200, { ForecastCategory: "Forecast" }), total(BEN, 300, { ForecastCategory: "BestCase" }), total(BEN, 400, { ForecastCategory: "Pipeline" }), total(ANA, 25, { ForecastCategory: "Omitted" }), total(BEN, 60, { ForecastCategory: "MostLikely" })] }),
});

const pd = (id: number, owner_id: number, value: number, extra: Param = {}) => ({ id, owner_id, value, currency: "EUR", title: "SECRET deal", is_deleted: false, ...extra });
const won = (id: number, owner: number, value: number, won_time: string, extra: Param = {}) => pd(id, owner, value, { status: "won", won_time, ...extra });
const open = (id: number, owner: number, value: number, expected_close_date: string | null, extra: Param = {}) => pd(id, owner, value, { status: "open", expected_close_date, ...extra });
const page = (data: unknown, next: string | null = null) => ({ json: { success: true, data, additional_data: { next_cursor: next } } });
/** Pipedrive: won over two pages (one won before the quarter, one after the week), open with one outside the quarter. */
const pipedrive = (o: { won?: Item[]; open?: Item[] } = {}): Nodes => ({
  "Read won deals": o.won ?? [
    page([won(1, 11, 100, "2026-10-02T09:00:00Z"), won(2, 11, 999, "2026-09-30T20:00:00Z")], "abc"),
    page([won(3, 22, 1000, "2026-10-18 21:30:00"), won(4, 22, 888, "2026-10-18T22:30:00Z"), won(1, 11, 100, "2026-10-02T09:00:00Z")]),
  ],
  "Read open deals": o.open ?? [page([open(5, 11, 200, "2026-10-01"), open(6, 22, 400, "2026-12-31"), open(7, 22, 777, "2027-01-01"), open(8, 22, 666, "2026-09-30"), open(9, 11, 555, null)])],
});

const PIPEDRIVE_ONLY = { commitMetric: undefined, bestCaseMetric: undefined };

describe("CRM forecast templates: the week and the quarter", () => {
  const week = async (at: string, o: { zone?: string; yearStart?: number; metrics?: Param[]; settings?: Param } = {}, crm = "hubspot") =>
    (await run(load(crm), "Week", { Settings: settings({ timeZone: o.zone ?? "Europe/Berlin", ...o.settings }), "What is filled": overview(o), Owners: one({ owners: [] }) }, { at }))[0].json;

  it("is the week that ended last, Monday first, and the quarter it starts in", async () => {
    expect(await week(MID_QUARTER)).toMatchObject({ period: "2026-10-12", quarterFirst: "2026-10-01", quarterLast: "2026-12-31", wonLast: "2026-10-18", snapshot: true });
  });
  it("gives a week that spans two quarters to the one it starts in, and counts wins only to that quarter's end", async () => {
    expect(await week(MONDAY)).toMatchObject({ period: "2026-09-28", quarterFirst: "2026-07-01", quarterLast: "2026-09-30", wonLast: "2026-09-30" });
    expect(await week("2027-01-04T12:00:00Z")).toMatchObject({ period: "2026-12-28", quarterFirst: "2026-10-01", wonLast: "2026-12-31" });
  });
  it("counts quarters from the month the Workspace's year starts in", async () => {
    expect(await week(MID_QUARTER, { yearStart: 2 })).toMatchObject({ quarterFirst: "2026-08-01", quarterLast: "2026-10-31" });
    expect(await week("2027-01-18T12:00:00Z", { yearStart: 12 })).toMatchObject({ period: "2027-01-11", quarterFirst: "2026-12-01", quarterLast: "2027-02-28" });
  });
  it("begins days at midnight in the time zone, summer and winter", async () => {
    const berlin = await week(MID_QUARTER);
    expect(new Date(berlin.fromMs as number).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(new Date(berlin.wonBeforeMs as number).toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(new Date(berlin.beforeMs as number).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    const york = await week(MID_QUARTER, { zone: "America/New_York" });
    expect(new Date(york.fromMs as number).toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(berlin.changedSince).toBe("2026-09-29T22:00:00Z");
  });
  it("sends what is a picture of today only on a Monday or Tuesday, as the zone counts them", async () => {
    expect((await week("2026-10-20T12:00:00Z")).snapshot).toBe(true);
    expect(await week("2026-10-21T12:00:00Z")).toMatchObject({ period: "2026-10-12", snapshot: false });
    // Sunday evening in New York is still the week before: it ended eight days ago.
    expect(await week("2026-10-19T02:00:00Z", { zone: "America/New_York" })).toMatchObject({ period: "2026-10-05", snapshot: false });
  });
  it("stops a run for a week Ziffr still counts as running, and for a Metric that is not weekly", async () => {
    const metric = (current: string, period = "week") => ({ metrics: [{ slug: "closed", period, current, filled: [] }] });
    await expect(week("2026-10-18T20:00:00Z", { zone: "Pacific/Auckland", ...metric("2026-10-12") })).rejects.toThrow(/still counts the week of 2026-10-12 as running/);
    await expect(week(MID_QUARTER, metric("2026-10-19"))).resolves.toBeTruthy();
    await expect(week(MID_QUARTER, metric("2026-10-01", "month"))).rejects.toThrow(/closed is not weekly/);
  });
  it("stops, in words, without a time zone, without Ziffr's year start, or with a Salesforce address that is not Salesforce's", async () => {
    for (const zone of ["", "Berlin time", "REPLACE-WITH-YOUR-TIME-ZONE-SUCH-AS-Europe/Berlin"]) await expect(week(MID_QUARTER, { zone })).rejects.toThrow(/timeZone is not a time zone/);
    await expect(week(MID_QUARTER, { yearStart: 0 })).rejects.toThrow(/did not say which month/);
    for (const instanceUrl of ["https://evil.example", "http://acme.my.salesforce.com", "https://acme.salesforce.com.evil.example", "https://evil.example/.salesforce.com", "https://REPLACE-WITH-YOUR-DOMAIN.example"]) {
      await expect(week(MID_QUARTER, { settings: { instanceUrl } }, "salesforce"), instanceUrl).rejects.toThrow(/instanceUrl/);
    }
    await expect(week(MID_QUARTER, { settings: { instanceUrl: "https://acme--uat.sandbox.my.salesforce.com/" } }, "salesforce")).resolves.toBeTruthy();
  });
});

describe("CRM forecast templates: the sums, the same for each CRM", () => {
  const cases = [
    { crm: "hubspot", reads: hubspot, a: "11", b: "22" },
    { crm: "salesforce", reads: salesforce, a: ANA.slice(0, 15), b: BEN },
  ] as const;
  for (const { crm, reads, a, b } of cases) {
    describe(crm, () => {
      it("sends closed, pipeline, commit and best case of the week for the team", async () => {
        const r = await flow(crm, reads());
        const upside = crm === "salesforce" ? 360 : 300;
        expect(values(r)).toEqual({ closed: 1150.25, pipeline: crm === "salesforce" ? 985 : 925, commit: 1350.25, "best-case": 1350.25 + upside });
        expect(r.items.every((i) => i.period === WEEK && Object.keys(i).sort().join() === "metric,period,value")).toBe(true);
      });
      it("gives each salesperson of the table their own, and sends no name, owner id or deal", async () => {
        const r = await flow(crm, reads(), { owners: [{ owner: a, closed: "closed-ana", commit: "commit-ana" }, { owner: b, pipeline: "pipeline-ben" }] });
        expect(values(r)).toMatchObject({ "closed-ana": 150.25, "commit-ana": 350.25, "pipeline-ben": crm === "salesforce" ? 760 : 700 });
        expect(JSON.stringify(r.sent)).not.toMatch(/SECRET|005000000000|"11"|"22"/);
      });
      it("sends nothing for an owner the CRM showed no deal of, and says so; the others are sent", async () => {
        const r = await flow(crm, reads(), { owners: [{ owner: "999999", closed: "closed-nobody" }] });
        expect(Object.keys(values(r))).not.toContain("closed-nobody");
        expect(r.notes).toMatch(/no deal of owner 999999.*nothing is sent/);
        expect(r.notes).toMatch(/Owner ids with deals and no line in Owners/);
      });
      it("leaves commit and best case out while their settings are as they came", async () => {
        const r = await flow(crm, reads(), { settings: { commitMetric: "REPLACE-WITH-THE-COMMIT-METRIC-SLUG-OR-LEAVE-TO-SKIP", bestCaseMetric: "" } });
        expect(Object.keys(values(r))).toEqual(["closed", "pipeline"]);
      });
      it("on a later day sends only closed this quarter", async () => {
        const r = await flow(crm, reads(), { at: "2026-10-22T12:00:00Z" });
        expect(Object.keys(values(r))).toEqual(["closed"]);
        expect(r.notes).toMatch(/only on a Monday or Tuesday/);
      });
      it("on a rerun sends nothing for a week Ziffr holds, and the same figures give the same key", async () => {
        const held = ["closed", "pipeline", "commit", "best-case"].map((slug) => ({ slug, period: "week", current: "2026-10-19", filled: [WEEK] }));
        expect((await flow(crm, reads(), { metrics: held })).sent).toEqual([]);
        const some = await flow(crm, reads(), { metrics: held.slice(0, 1) });
        expect(Object.keys(values(some))).toEqual(["pipeline", "commit", "best-case"]);
        expect((await flow(crm, reads())).sent[0].json.key).toBe((await flow(crm, reads())).sent[0].json.key);
      });
      it("refuses a table it cannot be sure of", async () => {
        const bad: [Param[], RegExp][] = [
          [[{ owner: "ana@example.com", closed: "x" }], /not an owner id/],
          [[{ owner: a, pipelin: "x" }], /“pipelin” is not known/],
          [[{ owner: a, closed: "Closed Ana" }], /not a Metric slug/],
          [[{ owner: a, closed: "x" }, { owner: a, pipeline: "y" }], /same owner appears twice/],
          [[{ owner: a, closed: "closed" }], /named twice/],
        ];
        for (const [owners, why] of bad) await expect(flow(crm, reads(), { owners }), String(why)).rejects.toThrow(why);
        await expect(flow(crm, reads(), { settings: { closedMetric: "", pipelineMetric: "", commitMetric: "", bestCaseMetric: "" } })).rejects.toThrow(/at least one Metric/);
        await expect(flow(crm, reads(), { settings: { closedMetric: "REPLACE-WITH-THE-CLOSED-THIS-QUARTER-METRIC-SLUG-OR-EMPTY" } })).rejects.toThrow(/closedMetric is not a Metric slug/);
      });
    });
  }
});

describe("hubspot-forecast-feed.json", () => {
  const wf = load("hubspot");
  const nodes = (): Nodes => ({ Week: one({ fromMs: 1000, wonBeforeMs: 2000, beforeMs: 3000 }) });
  it("only reads: two deal searches and one property, the login in n8n's credential", () => {
    const reads = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest" && !["Send to Ziffr", "What is filled"].includes(n.name));
    expect(reads.map((n) => `${n.parameters.method} ${n.parameters.url}`)).toEqual([
      "POST https://api.hubapi.com/crm/objects/2026-09/deals/search",
      "POST https://api.hubapi.com/crm/objects/2026-09/deals/search",
      "GET https://api.hubapi.com/crm/properties/2026-09/deals/hs_manual_forecast_category",
    ]);
    for (const n of reads) expect(n.parameters.nodeCredentialType).toBe("hubspotAppToken");
  });
  it("asks for won deals up to the week's end and open ones to the quarter's end, and never for a name", () => {
    const body = (name: string) => JSON.parse(worked(nodeOf(wf, name).parameters.jsonBody, nodes())) as { filterGroups: { filters: Param[] }[]; properties: string[]; limit: number };
    expect(body("Read won deals").filterGroups[0].filters).toEqual([
      { propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }, { propertyName: "closedate", operator: "GTE", value: "1000" }, { propertyName: "closedate", operator: "LT", value: "2000" },
    ]);
    expect(body("Read open deals").filterGroups[0].filters.map((f) => `${f.propertyName} ${f.operator} ${f.value}`)).toEqual(["hs_is_closed EQ false", "closedate GTE 1000", "closedate LT 3000"]);
    expect(body("Read open deals").limit).toBe(200);
    expect(body("Read open deals").properties).toEqual(["amount", "amount_in_home_currency", "deal_currency_code", "hubspot_owner_id", "hs_manual_forecast_category"]);
  });
  it("reads every page, and each later read once", () => {
    for (const name of ["Read won deals", "Read open deals"]) {
      const p = (nodeOf(wf, name).parameters.options as { pagination: { pagination: Param } }).pagination.pagination;
      expect(p).toMatchObject({ paginationMode: "updateAParameterInEachRequest", maxRequests: 50 });
      expect(JSON.stringify(p)).toContain("paging.next.after");
    }
    expect(nodeOf(wf, "Read open deals").executeOnce).toBe(true);
    expect(nodeOf(wf, "Read forecast categories")).toMatchObject({ executeOnce: true, onError: "continueRegularOutput" });
  });
  it("sends nothing when HubSpot has more deals than were read, or answers something else", async () => {
    await expect(flow("hubspot", hubspot({ open: [{ results: [], paging: { next: { after: "10000" } } }] }))).rejects.toThrow(/more deals than this template reads/);
    await expect(flow("hubspot", hubspot({ won: [{ status: "error" }] }))).rejects.toThrow(/did not answer with a list of deals/);
  });
  it("uses the amount in the company currency, counts a deal without an amount as 0, and will not mix currencies", async () => {
    const r = await flow("hubspot", hubspot({ won: [{ results: [deal("1", "11", "90", "CLOSED", { amount: "100", deal_currency_code: "USD" }), deal("2", "11", "", "CLOSED", { amount: "" })] }] }));
    expect(values(r).closed).toBe(90);
    expect(r.notes).toMatch(/1 deal\(s\) have no amount/);
    await expect(flow("hubspot", hubspot({ won: [{ results: [deal("1", "11", "", "CLOSED", { amount: "100", deal_currency_code: "USD" })] }] }))).rejects.toThrow(/in USD without its amount in your company currency/);
  });
  it("checks that the forecast categories exist, but only when commit or best case is wanted", async () => {
    await expect(flow("hubspot", hubspot({ options: [{ value: "commit" }] }))).rejects.toThrow(/no forecast category COMMIT, BEST_CASE; it has: commit/);
    await expect(flow("hubspot", hubspot({ options: undefined }))).rejects.toThrow(/did not say which forecast categories/);
    const off = { settings: { commitMetric: "", bestCaseMetric: "" } };
    expect(Object.keys(values(await flow("hubspot", hubspot({ options: undefined }), off)))).toEqual(["closed", "pipeline"]);
    await expect(flow("hubspot", hubspot({ options: undefined }), { ...off, owners: [{ owner: "11", commit: "commit-ana" }] })).rejects.toThrow(/did not say which/);
  });
  it("sends 0 for what the deals add up to as nothing, and nothing at all when HubSpot shows no deal", async () => {
    const r = await flow("hubspot", hubspot({ won: [{ total: 0, results: [] }] }));
    expect(values(r)).toMatchObject({ closed: 0, pipeline: 925, commit: 200 });
    await expect(flow("hubspot", hubspot({ won: [{ total: 0, results: [] }], open: [{ total: 0, results: [] }] }))).rejects.toThrow(/Nothing was sent.*showed no deal at all/);
  });
});

describe("salesforce-forecast-feed.json", () => {
  const wf = load("salesforce");
  const nodes: Nodes = { Settings: one({ instanceUrl: "https://acme.my.salesforce.com/ " }), Week: one({ quarterFirst: "2026-10-01", wonLast: "2026-10-18", quarterLast: "2026-12-31" }) };
  const reads = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest" && !["Send to Ziffr", "What is filled"].includes(n.name));
  it("only reads, with GET, two grouped queries that ask for totals and owner ids only", () => {
    const queries = reads.map((n) => {
      expect(n.parameters).toMatchObject({ method: "GET", nodeCredentialType: "salesforceOAuth2Api" });
      expect(worked(n.parameters.url, nodes)).toBe("https://acme.my.salesforce.com/services/data/v62.0/query");
      return worked((n.parameters.queryParameters as { parameters: { value: string }[] }).parameters[0].value, nodes);
    });
    expect(queries).toEqual([
      "SELECT OwnerId, SUM(Amount) amountSum, COUNT(Id) dealCount, COUNT(Amount) pricedCount FROM Opportunity WHERE IsWon = true AND CloseDate >= 2026-10-01 AND CloseDate <= 2026-10-18 GROUP BY OwnerId",
      "SELECT OwnerId, ForecastCategory, SUM(Amount) amountSum, COUNT(Id) dealCount, COUNT(Amount) pricedCount FROM Opportunity WHERE IsClosed = false AND CloseDate >= 2026-10-01 AND CloseDate <= 2026-12-31 GROUP BY OwnerId, ForecastCategory",
    ]);
  });
  it("sends nothing when there are more groups than one query gives, or a category it does not know", async () => {
    await expect(flow("salesforce", salesforce({ done: false }))).rejects.toThrow(/more groups than one query/);
    await expect(flow("salesforce", salesforce({ open: [total(ANA, 1, { ForecastCategory: "Commit" })] }))).rejects.toThrow(/does not know: Commit/);
  });
  it("counts a total without amounts as 0 and says how many had none; no record at all sends nothing", async () => {
    const r = await flow("salesforce", salesforce({ won: [total(ANA, null, { dealCount: 3, pricedCount: 0 })] }));
    expect(values(r).closed).toBe(0);
    expect(r.notes).toMatch(/3 opportunity\(ies\) have no amount/);
    await expect(flow("salesforce", salesforce({ won: [], open: [] }))).rejects.toThrow(/showed no deal at all/);
  });
});

describe("pipedrive-forecast-feed.json", () => {
  const wf = load("pipedrive");
  const run_ = (reads: Nodes, o: { settings?: Param; owners?: Param[]; at?: string } = {}) => flow("pipedrive", reads, { ...o, settings: { ...PIPEDRIVE_ONLY, ...o.settings } });
  it("only reads, with GET from the v2 list of deals, the token in a credential, every page", () => {
    const reads = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest" && !["Send to Ziffr", "What is filled"].includes(n.name));
    expect(reads.map((n) => n.name)).toEqual(["Read won deals", "Read open deals"]);
    for (const n of reads) {
      expect(n.parameters).toMatchObject({ method: "GET", url: "https://api.pipedrive.com/api/v2/deals", genericAuthType: "httpHeaderAuth" });
      expect(JSON.stringify(n.parameters.options)).toContain("additional_data.next_cursor");
      expect(JSON.stringify(n.parameters)).not.toMatch(/api_token/);
    }
    const query = (name: string) => Object.fromEntries((nodeOf(wf, name).parameters.queryParameters as { parameters: { name: string; value: string }[] }).parameters.map((p) => [p.name, worked(p.value, { Week: one({ changedSince: "2026-09-29T22:00:00Z" }) })]));
    expect(query("Read won deals")).toEqual({ status: "won", updated_since: "2026-09-29T22:00:00Z", limit: "500" });
    expect(query("Read open deals")).toEqual({ status: "open", limit: "500" });
    expect(nodeOf(wf, "Read open deals").executeOnce).toBe(true);
  });
  it("counts wins by the moment they were won in the time zone, and open deals by their expected close date", async () => {
    // In Berlin the week ends at 22:00 UTC on 18 October: deal 3 (21:30) counts, deal 4 (22:30) and deal 2 (September) do not.
    const r = await run_(pipedrive());
    expect(values(r)).toEqual({ closed: 1100, pipeline: 600 });
    expect(r.notes).toMatch(/1 open deal\(s\) have no expected close date/);
    expect(JSON.stringify(r.sent)).not.toMatch(/SECRET/);
  });
  it("gives each owner their own", async () => {
    const r = await run_(pipedrive(), { owners: [{ owner: "11", closed: "closed-ana", pipeline: "pipeline-ana" }] });
    expect(values(r)).toMatchObject({ "closed-ana": 100, "pipeline-ana": 200 });
  });
  it("has no commit or best case", async () => {
    await expect(run_(pipedrive(), { owners: [{ owner: "11", commit: "commit-ana" }] })).rejects.toThrow(/“commit” is not known/);
    expect(nodeOf(wf, "Settings").parameters).not.toHaveProperty("commitMetric");
    expect(JSON.stringify(nodeOf(wf, "Settings"))).not.toMatch(/commit|bestCase/);
  });
  it("adds up one currency only: another one among the counted deals stops the run, outside them it does not matter", async () => {
    await expect(run_(pipedrive({ open: [page([open(5, 11, 200, "2026-10-01", { currency: "USD" })])] }))).rejects.toThrow(/not in EUR \(USD\)/);
    await expect(run_(pipedrive({ open: [page([open(5, 11, 200, "2027-02-01", { currency: "USD" }), open(6, 11, 5, "2026-11-01")])] }))).resolves.toBeTruthy();
    await expect(run_(pipedrive(), { settings: { currency: "REPLACE-WITH-THE-CURRENCY-CODE-SUCH-AS-EUR" } })).rejects.toThrow(/currency is the three letters/);
  });
  it("takes an empty list, written as null, and then sends nothing; pages left over or a refused call stop the run", async () => {
    await expect(run_(pipedrive({ won: [page(null)], open: [page(null)] }))).rejects.toThrow(/showed no deal at all/);
    await expect(run_(pipedrive({ open: [page([], "more")] }))).rejects.toThrow(/more deals than this template reads/);
    await expect(run_(pipedrive({ open: [{ json: { success: false } }] }))).rejects.toThrow(/did not answer/);
    await expect(run_(pipedrive({ won: [page([won(1, 11, 5, "")])] }))).rejects.toThrow(/without the time it was won/);
  });
});

describe("CRM forecast templates: shape", () => {
  for (const crm of CRMS) {
    it(`${crm}: runs weekly on Monday, and the table of salespeople is empty as shipped`, async () => {
      const wf = load(crm);
      const trigger = wf.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger")!;
      expect(trigger.parameters).toEqual({ rule: { interval: [{ field: "weeks", triggerAtDay: [1], triggerAtHour: 12 }] } });
      expect((await run(wf, "Owners", {}))[0].json).toEqual({ owners: [] });
    });
    it(`${crm}: the example line of the table works once its comment is taken away`, async () => {
      const wf = load(crm);
      const code = String(nodeOf(wf, "Owners").parameters.jsCode).replace("  // { owner", "  { owner");
      const owners = ((await (vm.runInNewContext(`(async function(){${code}})`) as () => Promise<Item[]>)())[0].json.owners) as Param[];
      expect(Object.keys(owners[0])).toEqual(crm === "pipedrive" ? ["owner", "closed", "pipeline"] : ["owner", "closed", "pipeline", "commit", "bestCase"]);
    });
  }
});
