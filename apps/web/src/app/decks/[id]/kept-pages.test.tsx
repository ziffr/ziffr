// A slide that keeps a Snapshot's numbers is never filled from the live data (spec 0061; security review of the core):
// the deck editor and presenting ask getCanvasData only for what the deck draws live, and ask the kept numbers of
// readKeptNumbers.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SNAPSHOT_PART_SHAPE } from "@ziffr/core/snapshot-parts";

const shape = (id: string, type: string, parentId: string, props: Record<string, unknown>) => ({ id, typeName: "shape", type, parentId, meta: {}, props });
const widget = (id: string, parentId: string, metricId: number) => shape(id, "ziffr-widget", parentId, { template: "line", metricIds: [metricId], settings: "{}" });
/** A live slide with Metric 1, and a slide with a part whose widget names Metric 2. */
const document = { store: Object.fromEntries([
  shape("shape:live", "frame", "page:page", {}), widget("shape:a", "shape:live", 1),
  shape("shape:kept", "frame", "page:page", {}), shape("shape:p", SNAPSHOT_PART_SHAPE, "shape:kept", { w: 1, h: 1, snapshotId: 7, part: 3 }), widget("shape:b", "shape:kept", 2),
].map((s) => [s.id, s])) };

const asked = vi.hoisted(() => ({ canvas: vi.fn(), kept: vi.fn() }));
vi.mock("@/lib/access", async () => ({
  deckMetricIds: (await import("@ziffr/core/visibility")).deckMetricIds,
  getCanvasData: (...args: unknown[]) => { asked.canvas(...args); return Promise.resolve({}); },
  getGroups: async () => [], getRawShares: async () => [], revealedBy: async () => ({}),
}));
vi.mock("@ziffr/core/deck-snapshots", () => ({ readKeptNumbers: async (_actor: unknown, requests: unknown) => { asked.kept(requests); return []; }, snapshotAddition: async () => null }));
vi.mock("@/lib/viewer", () => ({ viewerId: async () => "sara", currentActor: async () => ({ personId: "sara", workspaceId: "w", role: "member" }) }));
vi.mock("@ziffr/core/page-data", () => ({ deckView: async () => ({ role: "owner", deck: { id: 5, name: "Review", document, theme_id: null, footer: null, owner_id: "sara" } }), savedWidgets: async () => [] }));
vi.mock("@ziffr/core/deck-templates", () => ({ listDeckTemplates: async () => [], deckTemplateSeed: async () => null, importSeedOf: () => null, readFills: () => [] }));
vi.mock("@ziffr/core/conversions", () => ({ deckSeed: async () => null }));
vi.mock("@ziffr/core/deck-additions", () => ({ deckAddition: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/count-view", () => ({ countView: async () => {} }));
vi.mock("@/lib/demo-follow", () => ({ followDemoSuccessor: async () => {} }));
vi.mock("@/components/desktop-only", () => ({ DesktopOnly: () => null }));
vi.mock("@/components/who-can-see", () => ({ RequestAccess: () => null }));
vi.mock("./loader", () => ({ DeckEditorLoader: () => null }));
vi.mock("./present/loader", () => ({ SlideshowLoader: () => null }));

import DeckPage from "./page";
import DeckPresentPage from "./present/page";

/** The Metric ids every call of getCanvasData named. */
const liveAsked = () => asked.canvas.mock.calls.flatMap((call) => call.slice(1).flat());
const params = { params: Promise.resolve({ id: "5" }), searchParams: Promise.resolve({}) };

beforeEach(() => { asked.canvas.mockClear(); asked.kept.mockClear(); });

describe.each([["the deck editor", DeckPage], ["presenting", DeckPresentPage]])("%s", (_name, page) => {
  it("loads live series only for what the deck draws live, and kept numbers from readKeptNumbers", async () => {
    await page(params);
    expect(liveAsked()).toEqual([1]);
    expect(asked.kept).toHaveBeenCalledWith([{ snapshotId: 7, parts: [3], metricIds: [2] }]);
  });
});

describe("the app", () => {
  it("never loads a deck by every Metric its shapes name", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const sources = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.filter((f) => readFileSync(join(root, f), "utf8").includes("allDeckMetricIds"))).toEqual([]);
  });
});
