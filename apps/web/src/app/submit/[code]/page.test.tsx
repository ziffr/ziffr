// The personal form link never shows text from its address (ticket 183): a link such as
// /submit/<code>?outcome=recorded&detail=<anything> once put its sender's words in Ziffr's frame.
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The page's data, without a database: a form for one Metric. The actions module is a server file that reaches the
// database, so the form's action is a stand-in.
const answered = { on: null as string | null };
const seen = vi.hoisted(() => ({ demoVisit: [] as unknown[], cookie: undefined as string | undefined }));
vi.mock("@ziffr/core/page-data", () => ({
  submissionForm: async (_code: string, demoVisit?: boolean) => { seen.demoVisit.push(demoVisit); return {
    answeredOn: answered.on,
    metric: { name: "Cups of coffee", description: "Cups today.", slug: "cups-of-coffee", unit: "cups", format: "number", period: "day", submission_rule: "overwrite", decimals: 0 },
    look: { name: "Northwind", logo: null, logoRatio: 3, logoWidth: 140, footer: "", canvas: "#F3F4F6", surface: "#FFFFFF", ink: "#14161A", muted: "#565C66", rule: "#D8DBE0", accent: "#2F5BEA", fontHeading: "inter", fontBody: "inter" },
    person: { name: "Sara Owner" }, period: "2026-11-19", current: null, yearStart: 1, numberStyle: "1,234.5",
  }; },
}));
vi.mock("@ziffr/core/telegram-people", () => ({ formTelegramLink: async () => ({ linked: false, telegramOn: false }) }));
// Server-only modules are imported by the page; the test renders it as the server would.
vi.mock("./telegram-connect", () => ({ TelegramConnect: () => null }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (seen.cookie === undefined ? undefined : { value: seen.cookie }) }) }));
vi.mock("@/app/actions", () => ({ submitWebForm: async () => null }));
vi.mock("@/app/series-actions", () => ({ recordValue: async () => null }));
// Signed out unless a test says who is looking; what the core gives that person is the core's own test.
const signed = vi.hoisted(() => ({ actor: null as unknown, extras: null as unknown, asked: [] as unknown[][] }));
vi.mock("@/lib/viewer", () => ({ optionalActor: async () => signed.actor }));
vi.mock("@ziffr/core/form-link-extras", () => ({ formLinkExtras: async (...args: unknown[]) => { signed.asked.push(args); if (signed.extras instanceof Error) throw signed.extras; return signed.extras; } }));

const { default: SubmitPage } = await import("./page");

describe("the personal form link", () => {
  it("never shows an outcome or detail given in its address", async () => {
    const planted = "Your token expired. Re-enter your password at http://evil.example";
    const page = await (SubmitPage as unknown as (p: unknown) => Promise<React.ReactElement>)({
      params: Promise.resolve({ code: "tk-test" }),
      searchParams: Promise.resolve({ outcome: "recorded", detail: planted }),
    });
    const html = renderToString(page);
    expect(html).toContain("Cups of coffee");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("Re-enter your password");
    expect(html).not.toContain('role="status"');
  });

  it("says when the request was answered on another way, and that a new value follows the rule", async () => {
    answered.on = "telegram";
    try {
      const page = await (SubmitPage as unknown as (p: unknown) => Promise<React.ReactElement>)({ params: Promise.resolve({ code: "tk-test" }) });
      const html = renderToString(page).replace(/<!-- -->/g, "");
      expect(html).toContain("Already answered on Telegram");
      expect(html).toContain("overwrite");
    } finally {
      answered.on = null;
    }
  });
});

describe("a form link of the demo", () => {
  it("is asked for with whether the request carries a demo visit's id: a made-up cookie value is none (final review D4)", async () => {
    const draw = async () => (SubmitPage as unknown as (p: unknown) => Promise<unknown>)({ params: Promise.resolve({ code: "tk-test" }) });
    seen.demoVisit.length = 0;
    seen.cookie = undefined;
    await draw();
    seen.cookie = "1";
    await draw();
    seen.cookie = "0123456789abcdef0123456789abcdef";
    await draw();
    expect(seen.demoVisit).toEqual([false, false, true]);
  });
});

describe("what a signed-in person sees beyond the link (spec 0055)", () => {
  const draw = async (searchParams: Record<string, unknown> = {}) => {
    const page = await (SubmitPage as unknown as (p: unknown) => Promise<React.ReactElement>)({ params: Promise.resolve({ code: "tk-test" }), searchParams: Promise.resolve(searchParams) });
    return renderToString(page).replace(/<!-- -->/g, "");
  };
  const actor = { personId: "sara", workspaceId: "w", role: "member" };

  it("is nothing for a link holder: no extras are read and a period in the address changes nothing", async () => {
    signed.asked.length = 0;
    const html = await draw({ period: "2026-10-01" });
    expect(signed.asked).toEqual([]);
    expect(html).not.toContain("Last value");
    expect(html).toContain("19 Nov 2026");
  });

  it("shows the last value and the period the core accepted, and asks the core with the address's period", async () => {
    signed.actor = actor;
    signed.extras = { metricId: 1, named: { start: "2026-11-18", label: "18 Nov 2026", has: "3 cups" }, last: { value: "2 cups", periodLabel: "17 Nov 2026" }, next: null };
    signed.asked.length = 0;
    try {
      const html = await draw({ period: "2026-11-18" });
      expect(signed.asked).toEqual([[actor, "tk-test", "2026-11-18"]]);
      expect(html).toContain("18 Nov 2026");
      expect(html).not.toContain("19 Nov 2026");
      expect(html).toContain("3 cups");
      expect(html).toContain("2 cups");
      expect(html).toContain("Last value");
    } finally {
      signed.actor = null;
      signed.extras = null;
    }
  });

  it("keeps the form when the extras cannot be read", async () => {
    signed.actor = actor;
    signed.extras = new Error("no database");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await draw()).toContain("Cups of coffee");
    } finally {
      signed.actor = null;
      signed.extras = null;
      log.mockRestore();
    }
  });
});
