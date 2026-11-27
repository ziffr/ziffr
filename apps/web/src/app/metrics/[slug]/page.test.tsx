// What the Metric page hands on (GLOSSARY: Derived Metric, Share): for someone who sees a Derived Metric but not all the
// Metrics it is calculated from, nothing the page gives its parts holds the slug or the name of one they do not see.
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Metric } from "@ziffr/core/types";
import MetricPage from "./page";

const { SEEN, UNSEEN, DERIVED, points } = vi.hoisted(() => {
  const base = { owner_id: "o", formula: null, from_catalog_id: null, created_at: "2026-01-01", description: "", unit: "", unit_position: "after", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", target_min: null, target_max: null, sources: ["web_form"], aggregation: "sum", attainment_method: null };
  const metric = (over: Partial<Metric>) => ({ ...base, ...over }) as Metric;
  const SEEN = metric({ id: 1, slug: "seen-input", name: "Orders" });
  const UNSEEN = metric({ id: 2, slug: "unseen-input", name: "Payroll", aggregation: "none", target_min: 5 });
  const DERIVED = metric({ id: 3, slug: "result", name: "Result", formula: "target({unseen-input}) * 1234 - {seen-input}", aggregation: "none", sources: [] });
  const points = [{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }, { period: "2026-03-01", value: 3 }];
  return { SEEN, UNSEEN, DERIVED, points };
});

// The page and its parts run on the server.
vi.mock("server-only", () => ({}));
// Modules the page's parts import make their database client as they load: an address nothing listens on, never called.
vi.hoisted(() => Object.assign(process.env, { SUPABASE_URL: "http://localhost:1", SUPABASE_SERVICE_ROLE_KEY: "none" }));
vi.mock("@/lib/data", () => ({
  getAllSeries: async () => ({ metrics: [SEEN, UNSEEN, DERIVED], series: { "seen-input": points, "unseen-input": points, result: points }, targets: {}, condensed: {} }),
  getProfiles: async () => [], getYearStart: async () => 1, getToday: async () => "2026-03-15", getNumberStyle: async () => "1,234.5", getAttainmentMethod: async () => "ratio",
  getBreakdowns: async () => ({}), getLastValues: async () => [], getSeriesValues: async () => ({ targets: {}, projections: {} }),
}));
vi.mock("@/lib/access", () => ({
  visibleMetricIds: async () => new Set([1, 3]), readableActions: async () => [], visibleDashboards: async () => [], getRawShares: async () => [], getGroups: async () => [],
}));
vi.mock("@/lib/viewer", () => ({ viewerId: async () => "v", currentActor: async () => ({ personId: "v", workspaceId: "w", role: "member" }) }));
vi.mock("@/lib/auth", () => ({ isDemo: async () => false }));
vi.mock("@/lib/demo-visit-action", () => ({ visitorsMayChangeDemo: async () => false }));
vi.mock("@/lib/count-view", () => ({ countView: async () => undefined }));
vi.mock("@ziffr/core/page-data", () => ({ metricExtras: async () => ({ tokens: [], workflows: [], workflowId: null, state: null, period: "2026-03-01", pending: [] }) }));
vi.mock("@ziffr/core/analysis-picker", () => ({ readyFor: async () => [] }));
vi.mock("@ziffr/core/access-keys", () => ({ submittingKeyNames: async () => ({}) }));
vi.mock("@ziffr/core/feeds", () => ({ feedChoices: async () => [], feedNames: async () => ({}) }));
vi.mock("@ziffr/core/ask-now", () => ({ canAskNow: async () => false }));
vi.mock("@ziffr/core/workspace-settings", () => ({ workspaceProfile: async () => ({ currency: "EUR" }) }));
vi.mock("@ziffr/core/archived-metrics", () => ({ canArchiveMetric: async () => false }));
vi.mock("@ziffr/core/record-own-value", () => ({ recordingOffer: async () => null }));
vi.mock("./alert-me", () => ({ alertMeData: async () => null }));
vi.mock("@ziffr/core/fill-in-offer", () => ({ fillInOffer: async () => null, guestStandIns: async () => [] }));
vi.mock("@ziffr/core/paste-values", () => ({ pastedValueIds: async () => [] }));
vi.mock("@ziffr/core/metrics", () => ({ canEditMetric: async () => true }));
vi.mock("@ziffr/core/prompt-preview", () => ({ nextPromptWays: async () => ({}), askingStops: async () => ({ mine: [], people: [], nobody: false }) }));
vi.mock("@ziffr/core/metric-owner", () => ({ handOverChoices: async () => [] }));
vi.mock("@ziffr/core/feed-template-download", () => ({ feedTemplates: () => [] }));
vi.mock("@ziffr/core/who-submits", () => ({ submitterChoices: async () => [] }));
vi.mock("@ziffr/core/value-notes", () => ({ periodValueNotes: async () => null, currentValueNotes: async () => ({}) }));

/** Every string in what an element tree is given. A part that takes the resolver is worked out on the server (a function
 * cannot be handed to a browser), so what it takes stays there. */
function given(node: unknown, out: string[] = [], met = new Set<unknown>()): string[] {
  if (typeof node === "string") out.push(node);
  if (!node || typeof node !== "object" || met.has(node)) return out;
  met.add(node);
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    return typeof props.resolve === "function" ? out : given(props, out, met);
  }
  // Keys count as words too: a record may be keyed by a Metric's slug.
  if (node instanceof Map) for (const [k, v] of node) { given(k, out, met); given(v, out, met); }
  else if (node instanceof Set || Array.isArray(node)) for (const v of node) given(v, out, met);
  else for (const [k, v] of Object.entries(node)) { out.push(k); given(v, out, met); }
  return out;
}

describe("the Metric page of a Derived Metric with an input the viewer does not see", () => {
  it.each(["overview", "analysis", "targets", "history", "settings"])("hands its parts nothing that names it (%s tab)", async (tab) => {
    const page: ReactNode = await MetricPage({ params: Promise.resolve({ slug: "result" }), searchParams: Promise.resolve({ tab }) });
    const words = given(page).join("\n");
    // The page was drawn, with the Metric itself in it.
    expect(words).toContain("Result");
    expect(words).not.toMatch(/unseen-input|Payroll|1234/);
  });
});
