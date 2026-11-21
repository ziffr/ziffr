// The installable web app (#143): the manifest's icons and colours, and the service worker's rule that it keeps
// nothing but the offline page and stays out of sign-in, the API, MCP and server actions (public/sw.js).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import { APP_COLOURS } from "@/lib/app-colours";

const PUBLIC = join(import.meta.dirname, "../../public");

/** oklch(L% C h) as sRGB hex, as a browser draws it (clipped to the sRGB gamut). */
function oklchToHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((x) => {
    const c = Math.max(0, Math.min(1, x));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, "0");
  }).join("");
}

describe("the manifest", () => {
  it("installs as a window of its own, with icons that exist in every size browsers ask for", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    for (const icon of m.icons ?? []) expect(existsSync(join(PUBLIC, icon.src))).toBe(true);
    const sizes = (purpose: string) => (m.icons ?? []).filter((i) => i.purpose === purpose).map((i) => i.sizes);
    expect(sizes("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(sizes("maskable")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(existsSync(join(PUBLIC, "icons/apple-touch-icon.png"))).toBe(true);
  });

  it("takes its colours from the design tokens", () => {
    const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
    const paper = /--color-paper:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(tokens);
    expect(paper).not.toBeNull();
    const [, L, C, h] = paper!.map(Number);
    expect(APP_COLOURS.background).toBe(oklchToHex(L / 100, C, h));
    const dark = /data-appearance="dark"\][^}]*?--color-paper:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(readFileSync(join(import.meta.dirname, "appearance.css"), "utf8"));
    expect(dark).not.toBeNull();
    const [, dL, dC, dh] = dark!.map(Number);
    expect(APP_COLOURS.backgroundDark).toBe(oklchToHex(dL / 100, dC, dh));
  });
});

type Handler = (event: { request: Request; respondWith: (r: unknown) => void; waitUntil: (p: unknown) => void }) => void;

/** Loads public/sw.js with a fake worker scope, and records what it caches. */
function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const cached: string[] = [];
  const cache = { addAll: async (urls: string[]) => void cached.push(...urls), put: async (r: Request) => void cached.push(r.url) };
  const scope = {
    location: new URL("https://ziffr.example/sw.js"),
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => new Response("offline") };
  runInNewContext(readFileSync(join(PUBLIC, "sw.js"), "utf8"), { self: scope, caches, fetch: async () => new Response("page"), URL, Response, Promise });
  /** Whether the worker answers this request itself (otherwise the browser handles it as without a worker). */
  const answers = (url: string, init: { method?: string; mode?: "navigate" | "cors" } = {}) => {
    let answered = false;
    const request = { url: new URL(url, "https://ziffr.example").href, method: init.method ?? "GET", mode: init.mode ?? "navigate" } as Request;
    handlers.fetch({ request, respondWith: () => (answered = true), waitUntil: () => {} });
    return answered;
  };
  return { handlers, cached, answers };
}

describe("the service worker", () => {
  it("caches only the offline page", async () => {
    const { handlers, cached } = loadWorker();
    let done: unknown;
    handlers.install({ request: undefined as never, respondWith: () => {}, waitUntil: (p) => (done = p) });
    await done;
    expect(cached).toEqual(["/offline.html"]);
  });

  it("stays out of sign-in, the API, MCP, server actions and data fetches", () => {
    const { answers } = loadWorker();
    for (const path of ["/auth/callback?code=x", "/auth/confirm", "/login", "/login/check", "/api/v1/metrics", "/api/slack/events", "/mcp", "/oauth/authorize", "/.well-known/oauth-authorization-server"]) {
      expect(answers(path), path).toBe(false);
    }
    expect(answers("/metrics/1", { method: "POST" }), "a server action").toBe(false);
    expect(answers("/metrics/1?_rsc=abc", { mode: "cors" }), "an RSC payload").toBe(false);
    expect(answers("https://elsewhere.example/"), "another site").toBe(false);
  });

  it("loads pages from the network and stores none of them", async () => {
    const { answers, cached } = loadWorker();
    expect(answers("/metrics/1")).toBe(true);
    expect(answers("/actions")).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(cached).toEqual([]);
  });
});
