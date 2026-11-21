// The words sealed inside JSON columns, moved to the current key version by the re-encryption job (spec 0028, ticket
// #250): plain words sealed for their place, older versions sealed again, a word that does not open left alone, and
// the rule for when a column must be scanned again.
import { describe, expect, it } from "vitest";
import { scanDue } from "./workspace-key-job";
import { openObject as openObjectOf } from "./sealed-words";
import { resealThing, SEALED_THINGS } from "./sealed-things";
import { cipherFromKeys, isSealed, sealedVersion, type WorkspaceCipher } from "./workspace-keys";

const WS = "11111111-1111-4111-8111-111111111111";
const v1 = { version: 1, key: Buffer.alloc(32, 1) };
const v2 = { version: 2, key: Buffer.alloc(32, 2) };
const one = cipherFromKeys(WS, [v1]);
const two = cipherFromKeys(WS, [v1, v2]);
const openObject = (cipher: WorkspaceCipher, table: string, column: string, row: string | number, stored: unknown) => openObjectOf(cipher, { table, column, row }, stored);
const openSettings = (cipher: WorkspaceCipher, table: string, row: string, value: unknown) => cipher.open({ table, column: "snapshot.settings.kicker", row }, (value as { settings: { kicker: string } }).settings.kicker);
const thing = (table: string, column: string) => SEALED_THINGS.find((t) => t.table === table && t.column === column)!;

describe("resealThing", () => {
  it("seals plain Finding words for their widget, and the free layout's seed", () => {
    const row = { id: 7, value: { kicker: "K", headline: "", panels: [], canvasSeed: { settings: { headline: "Seed" } } } };
    const done = resealThing(one, thing("widgets", "settings"), row);
    expect(done.changed).toBe(true);
    const v = done.value as { kicker: string; headline: string; canvasSeed: { settings: { headline: string } } };
    expect(isSealed(v.kicker)).toBe(true);
    expect(v.headline).toBe("");
    expect(one.open({ table: "widgets", column: "settings.kicker", row: 7 }, v.kicker)).toBe("K");
    expect(one.open({ table: "widgets", column: "settings.canvas_seed.settings.headline", row: 7 }, v.canvasSeed.settings.headline)).toBe("Seed");
    // Another widget's place does not open it.
    expect(one.open({ table: "widgets", column: "settings.kicker", row: 8 }, v.kicker)).toBeNull();
    // Already current: nothing to do.
    expect(resealThing(one, thing("widgets", "settings"), { id: 7, value: done.value }).changed).toBe(false);
  });

  it("moves words of an older key version to the current one", () => {
    const sealed = resealThing(one, thing("widgets", "settings"), { id: 7, value: { kicker: "K" } }).value;
    const moved = resealThing(two, thing("widgets", "settings"), { id: 7, value: sealed });
    expect(moved.changed).toBe(true);
    expect(sealedVersion((moved.value as { kicker: string }).kicker)).toBe(2);
    expect(two.open({ table: "widgets", column: "settings.kicker", row: 7 }, (moved.value as { kicker: string }).kicker)).toBe("K");
  });

  it("leaves a whole row alone when a sealed word does not open", () => {
    const other = resealThing(one, thing("widgets", "settings"), { id: 99, value: { headline: "Else" } }).value as { headline: string };
    const done = resealThing(one, thing("widgets", "settings"), { id: 7, value: { headline: other.headline, kicker: "Plain" } });
    expect(done).toMatchObject({ changed: false, unopenable: true });
  });

  it("seals and moves an object of words kept as {sealed}", () => {
    const plain = resealThing(one, thing("dashboard_snapshots", "words"), { id: 3, value: { intro: "Hi" } });
    expect(plain.changed).toBe(true);
    expect(openObject(one, "dashboard_snapshots", "words", 3, plain.value)).toEqual({ intro: "Hi" });
    const moved = resealThing(two, thing("dashboard_snapshots", "words"), { id: 3, value: plain.value });
    expect(moved.changed).toBe(true);
    expect(sealedVersion((moved.value as { sealed: string }).sealed)).toBe(2);
    expect(resealThing(two, thing("dashboard_snapshots", "words"), { id: 3, value: moved.value }).changed).toBe(false);
    // Not an object (a link with no kept words): nothing to do. A wrapper sealed for another row: left alone.
    expect(resealThing(one, thing("view_links", "snapshot_words"), { id: 3, value: null }).changed).toBe(false);
    expect(resealThing(one, thing("dashboard_snapshots", "words"), { id: 4, value: plain.value })).toMatchObject({ changed: false, unopenable: true });
  });

  it("seals the data a Snapshot or a View Link froze as one text, Breakdown labels inside it first, and the words of a frozen dashboard", () => {
    const data = { metrics: [{ id: 5 }, { id: 7 }], breakdowns: { "5": { "2026-10-01": [{ label: "Shop", value: 1 }, { label: "", value: 2 }] } } };
    const snapshot = resealThing(one, thing("dashboard_snapshots", "frozen"), { id: 3, value: { name: "D", data } });
    const frozen = snapshot.value as { data: { sealed: string }; metricIds: number[] };
    expect(snapshot.changed).toBe(true);
    // The Metrics it kept are listed beside the data, ids only.
    expect(frozen.metricIds).toEqual([5, 7]);
    const inner = JSON.parse(one.open({ table: "dashboard_snapshots", column: "frozen.data", row: 3 }, frozen.data.sealed)!) as typeof data;
    const labels = inner.breakdowns["5"]["2026-10-01"];
    expect(isSealed(labels[0].label)).toBe(true);
    expect(one.open({ table: "dashboard_snapshots", column: "frozen.data.breakdowns.5.2026_10_01.0.label", row: 3 }, labels[0].label)).toBe("Shop");
    // Sealed once, it is left alone under the same key version, and moved under a newer one, labels included.
    expect(resealThing(one, thing("dashboard_snapshots", "frozen"), { id: 3, value: snapshot.value }).changed).toBe(false);
    const moved = resealThing(two, thing("dashboard_snapshots", "frozen"), { id: 3, value: snapshot.value });
    expect(moved.changed).toBe(true);
    expect(sealedVersion((moved.value as typeof frozen).data.sealed)).toBe(2);
    const movedInner = JSON.parse(two.open({ table: "dashboard_snapshots", column: "frozen.data", row: 3 }, (moved.value as typeof frozen).data.sealed)!) as typeof data;
    expect(sealedVersion(movedInner.breakdowns["5"]["2026-10-01"][0].label)).toBe(2);
    expect((moved.value as typeof frozen).metricIds).toEqual([5, 7]);
    // Data that does not open (another row) is counted, never rewritten.
    expect(resealThing(one, thing("dashboard_snapshots", "frozen"), { id: 4, value: snapshot.value })).toMatchObject({ changed: false, unopenable: true });
    expect(resealThing(one, thing("dashboard_snapshots", "frozen"), { id: 3, value: { name: "no data" } }).changed).toBe(false);
    const link = resealThing(one, thing("view_links", "frozen"), { id: 9, value: { intro: "Intro", widgets: [{ id: 4, title: "T", settings: { headline: "H" } }], data } });
    const v = link.value as { intro: string; widgets: { title: string }[]; data: { sealed: string } };
    expect(link.changed).toBe(true);
    expect(one.open({ table: "view_links", column: "frozen.intro", row: 9 }, v.intro)).toBe("Intro");
    expect(one.open({ table: "view_links", column: "frozen.widgets.4.title", row: 9 }, v.widgets[0].title)).toBe("T");
    expect(isSealed(v.data.sealed)).toBe(true);
    expect(resealThing(one, thing("view_links", "frozen"), { id: 9, value: "not an object" }).changed).toBe(false);
  });

  it("seals a Workflow's Check percentage and Tell level for the Workflow", () => {
    const config = { dueWorkingDays: 2, steps: [{ type: "check", changePct: 40, outsideTarget: false }, { type: "tell", id: "a", condition: { kind: "at_or_above", value: "12.5" }, people: [], groups: [] }] };
    const done = resealThing(one, thing("workflows", "config"), { id: 11, value: config });
    const steps = (done.value as typeof config).steps as { changePct?: string; condition?: { value: string } }[];
    expect(done.changed).toBe(true);
    expect(one.open({ table: "workflows", column: "config.steps.0.change_pct", row: 11 }, steps[0].changePct!)).toBe("40");
    expect(one.open({ table: "workflows", column: "config.steps.1.condition.value", row: 11 }, steps[1].condition!.value)).toBe("12.5");
    expect(resealThing(one, thing("workflows", "config"), { id: 11, value: done.value }).changed).toBe(false);
    expect(resealThing(two, thing("workflows", "config"), { id: 11, value: done.value }).changed).toBe(true);
    expect(resealThing(one, thing("workflows", "config"), { id: 12, value: done.value }).unopenable).toBe(true);
  });

  it("seals a Version's words for the Version, by kind", () => {
    const widget = resealThing(one, thing("versions", "snapshot"), { id: 1, value: { title: "T", settings: { kicker: "K" } }, object_type: "widget", object_id: 5, version: 2 });
    expect(one.open({ table: "versions", column: "snapshot.title", row: "widget-5-2" }, (widget.value as { title: string }).title)).toBe("T");
    expect(openSettings(one, "versions", "widget-5-2", widget.value)).toBe("K");
    const snapshot = resealThing(one, thing("versions", "snapshot"), { id: 2, value: { words: { intro: "I" } }, object_type: "snapshot", object_id: 3, version: 1 });
    expect(snapshot.changed).toBe(true);
    expect(one.open({ table: "versions", column: "snapshot.words", row: "snapshot-3-1" }, (snapshot.value as { words: { sealed: string } }).words.sealed)).toBe('{"intro":"I"}');
    // A deck holds no words of this kind; a value that is no object is left as it is.
    expect(resealThing(one, thing("versions", "snapshot"), { id: 3, value: { name: "x" }, object_type: "deck", object_id: 1, version: 1 }).changed).toBe(false);
    expect(resealThing(one, thing("versions", "snapshot"), { id: 3, value: null }).changed).toBe(false);
  });

  it("changes nothing where the Workspace does not seal", () => {
    const none = cipherFromKeys(WS, []);
    expect(resealThing(none, thing("widgets", "settings"), { id: 7, value: { kicker: "K" } })).toEqual({ value: { kicker: "K" }, changed: false, unopenable: false });
  });
});

describe("scanDue", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const done = { done_at: "2026-11-21T10:00:00Z", done_version: 2, scan_started_at: "2026-11-21T09:59:00Z", verified_through: null };
  it("is due when never finished, finished under another version, or interrupted", () => {
    expect(scanDue(undefined, 2, [], now)).toBe(true);
    expect(scanDue({ ...done, done_at: null }, 2, [], now)).toBe(true);
    expect(scanDue({ ...done, done_version: 1 }, 2, [], now)).toBe(true);
  });
  it("is not due when finished under the current version and nothing is retired", () => {
    expect(scanDue(done, 2, [{ version: 2, retiredAt: null }], now)).toBe(false);
  });
  it("is due once a retired version has settled and the last scan began before it", () => {
    const retired = [{ version: 1, retiredAt: "2026-11-21T10:00:00Z" }, { version: 2, retiredAt: null }];
    // Not yet settled (15 minutes), the scan began before: wait.
    expect(scanDue(done, 2, retired, Date.parse("2026-11-21T10:10:00Z"))).toBe(false);
    // Settled, the scan began before: scan again.
    expect(scanDue(done, 2, retired, Date.parse("2026-11-21T10:16:00Z"))).toBe(true);
    // Settled, and the last scan began after it: done.
    expect(scanDue({ ...done, scan_started_at: "2026-11-21T10:20:00Z" }, 2, retired, Date.parse("2026-11-21T10:30:00Z"))).toBe(false);
    expect(scanDue({ ...done, scan_started_at: null }, 2, retired, Date.parse("2026-11-21T10:30:00Z"))).toBe(true);
  });
});
