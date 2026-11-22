// Sealed Workflow numbers, a Metric Version's name and Targets and kept data (spec 0028, ticket #248).
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapConfigNumbers, openConfig, sealConfig } from "./sealed-workflow";
import { mapVersionWords, openFrozenData, opening, sealFrozenData, sealing } from "./sealed-words";
import { cipherFromKeys, isSealed } from "./workspace-keys";

const WS = "11111111-1111-4111-8111-111111111111";
const cipher = cipherFromKeys(WS, [{ version: 1, key: randomBytes(32) }]);
const plain = cipherFromKeys(WS, []);
type Cfg = { steps: { id?: string; type?: string; changePct?: string; condition: { value: string; share: string } }[] };
const config = {
  dueWorkingDays: 3,
  steps: [
    { type: "remind", daysBefore: 1 },
    { type: "check", changePct: 40, outsideTarget: true },
    { type: "tell", id: "a", condition: { kind: "at_or_above", value: "12.5" }, people: [], groups: [] },
    { type: "tell", id: "b", condition: { kind: "share_of_target", share: "80" }, people: [], groups: [] },
    { type: "tell", id: "c", condition: { kind: "missing_after_due" }, people: [], groups: [] },
    "odd",
  ],
};

describe("Workflow config numbers", () => {
  it("seals the check level and the Tell levels, and opens them again", () => {
    const sealed = sealConfig(cipher, 7, config) as unknown as Cfg;
    expect(isSealed(sealed.steps[1].changePct as string)).toBe(true);
    expect(isSealed(sealed.steps[2].condition.value)).toBe(true);
    expect(isSealed(sealed.steps[3].condition.share)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("12.5");
    expect(sealed.steps[0]).toEqual(config.steps[0]);
    expect(sealed.steps[4]).toEqual(config.steps[4]);
    expect(openConfig(cipher, 7, sealed)).toEqual(config);
  });
  it("leaves the config as it is where nothing is sealed, and plain configs open as they are", () => {
    expect(sealConfig(plain, 7, config)).toBe(config);
    expect(openConfig(cipher, 7, config)).toEqual(config);
    expect(openConfig(plain, 7, config)).toEqual(config);
  });
  it("leaves out a Tell step whose number does not open, and holds a Check to the strictest level", () => {
    const sealed = sealConfig(cipher, 7, config);
    const kinds = (c: { steps: unknown[] }) => c.steps.map((s) => (s as { id?: string; type?: string }).id ?? (s as { type?: string }).type ?? s);
    // Opened as another Workflow, nothing opens: no Check guard may vanish, so it keeps level 1; the Tell steps go.
    const other = openConfig(cipher, 8, sealed);
    expect(kinds(other)).toEqual(["remind", "check", "c", "odd"]);
    expect(other.steps[1]).toMatchObject({ type: "check", changePct: 1 });
    const tampered = { ...config, steps: [{ type: "check", changePct: "not-a-number", outsideTarget: false }] };
    expect(openConfig(cipher, 7, mapConfigNumbers(tampered, () => "x", "config."))).toEqual({ ...config, steps: [{ type: "check", changePct: 1, outsideTarget: false }] });
  });
  it("passes things that are not a config", () => {
    expect(mapConfigNumbers(null, () => "x", "")).toBeNull();
    expect(mapConfigNumbers({ steps: 3 }, () => "x", "")).toEqual({ steps: 3 });
    expect(mapConfigNumbers({ steps: [{ type: "check", changePct: null }, { type: "tell", condition: null }] }, () => "x", "")).toEqual({ steps: [{ type: "check", changePct: null }, { type: "tell", condition: null }] });
  });
});

describe("the words of a Checklist Item", () => {
  const item = { type: "checklist", id: "item-one-aaaa", kind: "info", text: "Invoices must be in by Friday.", day: 1, people: ["p1"], groups: [] };
  const cfg = { dueWorkingDays: 1, steps: [{ type: "remind", daysBefore: 1 }, item, { type: "check", changePct: 40, outsideTarget: true }] };
  it("are sealed in place, bound to the Workflow and the step's place, and open again", () => {
    const sealed = sealConfig(cipher, 7, cfg) as unknown as { steps: { text?: string; people?: string[] }[] };
    expect(isSealed(sealed.steps[1].text as string)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("Invoices");
    // What names no word stays as it is: the people and the day are ids and numbers.
    expect(sealed.steps[1].people).toEqual(["p1"]);
    expect(openConfig(cipher, 7, sealed)).toEqual(cfg);
    expect(sealConfig(plain, 7, cfg)).toBe(cfg);
  });
  it("leave the step out of what runs when they do not open, never running as ciphertext", () => {
    const sealed = sealConfig(cipher, 7, cfg);
    // Another Workflow, another place (the step moved without being sealed again) or a text changed in the database.
    expect(openConfig(cipher, 8, sealed).steps.map((s) => s.type)).toEqual(["remind", "check"]);
    const moved = { ...sealed, steps: [sealed.steps[1], sealed.steps[0], sealed.steps[2]] };
    expect(openConfig(cipher, 7, moved).steps.map((s) => s.type)).toEqual(["remind", "check"]);
    expect(JSON.stringify(openConfig(cipher, 8, sealed))).not.toContain("w1.");
  });
  it("are sealed in a Version of the Workflow for the Version's own place", () => {
    const version = { config: cfg };
    const sealed = mapVersionWords("workflow", version, sealing(cipher, "versions", "workflow-1-2")) as { config: { steps: { text?: string }[] } };
    expect(isSealed(sealed.config.steps[1].text as string)).toBe(true);
    expect(mapVersionWords("workflow", sealed, opening(cipher, "versions", "workflow-1-2"))).toEqual(version);
  });
});

describe("Versions of Workflows and Metrics", () => {
  const metric = { name: "Revenue", description: "d", target_min: 5, target_max: 0, unit: "EUR" };
  it("seals a Metric's name and Targets, in place, and opens them again as numbers", () => {
    const sealed = mapVersionWords("metric", metric, sealing(cipher, "versions", "metric-1-2"));
    expect(isSealed(sealed.name as string)).toBe(true);
    expect(isSealed(sealed.target_min as string)).toBe(true);
    expect(isSealed(sealed.target_max as string)).toBe(true);
    expect(sealed.unit).toBe("EUR");
    expect(mapVersionWords("metric", sealed, opening(cipher, "versions", "metric-1-2"))).toEqual(metric);
    expect(mapVersionWords("metric", metric, sealing(plain, "versions", "metric-1-2"))).toEqual(metric);
    expect(mapVersionWords("metric", metric, opening(cipher, "versions", "metric-1-2"))).toEqual(metric);
  });
  it("leaves out a name or Target that does not open", () => {
    const sealed = mapVersionWords("metric", metric, sealing(cipher, "versions", "metric-1-2"));
    const lost = mapVersionWords("metric", sealed, opening(cipher, "versions", "metric-1-3"));
    expect("name" in lost).toBe(false);
    expect("target_min" in lost).toBe(false);
    expect(lost.description).toBe("");
    expect(mapVersionWords("metric", { target_min: "oops" }, (_c, t) => t)).toEqual({});
    expect(mapVersionWords("metric", { target_min: null, name: 3 }, (_c, t) => t)).toEqual({ target_min: null, name: 3 });
  });
  it("seals a Workflow Version's numbers", () => {
    const sealed = mapVersionWords("workflow", { name: "W", config }, sealing(cipher, "versions", "workflow-1-1")) as { config: Cfg };
    expect(isSealed(sealed.config.steps[1].changePct as string)).toBe(true);
    expect(mapVersionWords("workflow", sealed, opening(cipher, "versions", "workflow-1-1"))).toEqual({ name: "W", config });
  });
});

describe("kept data", () => {
  const kept = { name: "n", data: { metrics: [{ id: 1, name: "Revenue" }], series: { 1: [1, 2] } } };
  it("is sealed as a whole for its row and opened again", () => {
    const sealed = sealFrozenData(cipher, "view_links", 4, kept);
    expect(JSON.stringify(sealed)).not.toContain("Revenue");
    expect(openFrozenData(cipher, "view_links", 4, sealed)).toEqual(kept);
    expect(openFrozenData(cipher, "view_links", 5, sealed)).toBeNull();
    expect(openFrozenData(cipher, "dashboard_snapshots", 4, sealed)).toBeNull();
  });
  it("stays plain where nothing is sealed, and plain data opens", () => {
    expect(sealFrozenData(plain, "view_links", 4, kept)).toEqual(kept);
    expect(openFrozenData(cipher, "view_links", 4, kept)).toEqual(kept);
    expect(openFrozenData(cipher, "view_links", 4, { data: undefined })).toBeNull();
  });
});
