// @vitest-environment happy-dom
// The Library (ticket #1030): the way into the Playground is shown to Owners and Admins only, in the Library and at the end of
// Choose a method; the old addresses of View Designs and the Playground lead on to the Library.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The picker offers Fill past periods, whose actions are the server's.
vi.mock("@/app/paste-actions", () => ({ pasteTemplateFile: vi.fn() }));
vi.mock("@/app/picker-actions", () => ({ pickerList: async () => ({ canvas: [], groups: [] }), pickerRun: async () => ({ ok: false, message: "" }) }));
vi.mock("@/app/canvas-actions", () => ({ saveToPool: vi.fn() }));
import { RecipesSection } from "./recipes-section";
import { MethodPicker } from "@/app/analyze/method-picker";
import nextConfig from "../../../../next.config";

const PLAYGROUND = "/settings/library/playground";

describe("the Library's Analysis Recipes", () => {
  it("lists the built-in recipes for everyone, with the Playground link for Owners and Admins only", () => {
    const writer = renderToStaticMarkup(<RecipesSection writes />);
    const reader = renderToStaticMarkup(<RecipesSection writes={false} />);
    expect(writer).toContain(`href="${PLAYGROUND}"`);
    expect(reader).not.toContain("playground");
    expect(reader).toContain("Linear trend");
    expect(writer).toContain("Linear trend");
  });
});

describe("Choose a method", () => {
  it("ends with 'Write your own method' for Owners and Admins, and shows nothing of the kind to others", () => {
    expect(renderToStaticMarkup(<MethodPicker ids={[]} writes onResult={() => {}} />)).toContain(`href="${PLAYGROUND}"`);
    expect(renderToStaticMarkup(<MethodPicker ids={[]} writes onResult={() => {}} />)).toContain("Write your own method");
    const other = renderToStaticMarkup(<MethodPicker ids={[]} onResult={() => {}} />);
    expect(other).not.toContain("Write your own method");
    expect(other).not.toContain("playground");
  });
});

describe("the old addresses", () => {
  it("lead on to the Library", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual(expect.objectContaining({ source: "/analyze/designs", destination: "/settings/library" }));
    expect(rules).toContainEqual(expect.objectContaining({ source: "/analyze/playground", destination: PLAYGROUND }));
  });
});
