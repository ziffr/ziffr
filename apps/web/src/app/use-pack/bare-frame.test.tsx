// What the guided Pack set-up's own frame must keep (spec 0068; GLOSSARY: Pack, Practice Workspace, Trial Workspace):
// it is drawn without the app around it, so every way out loads its page anew, a Practice Workspace still says what it
// is, and an ended trial never reaches the questions.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// What a navigation in the browser would look like: told apart from a plain link.
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a data-in-browser {...props}>{children}</a> }));
import { PracticeBar } from "@/components/practice-bar";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const sources = readdirSync(HERE, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));

describe("the frame of Use this pack", () => {
  it("has no navigation in the browser: the app shell would be missing on the page it leads to", () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.filter((f) => /from "next\/link"|useRouter/.test(readFileSync(`${HERE}${f}`, "utf8")))).toEqual([]);
  });

  it("shows a Practice Workspace's bar with links that load their page anew", () => {
    const bare = renderToStaticMarkup(<PracticeBar fullLoad startOver="/installation#practice" />);
    expect(bare).toContain("Practice Workspace.");
    expect(bare.match(/<a /g)).toHaveLength(3);
    expect(bare).not.toContain("data-in-browser");
    // In the app they stay as they were.
    expect(renderToStaticMarkup(<PracticeBar startOver={null} />)).toContain("data-in-browser");
  });

  it("sends an ended trial Home before anything of the Pack is read", () => {
    const page = readFileSync(`${HERE}[ref]/page.tsx`, "utf8");
    const ended = page.indexOf('if (await trialEnded(actor.workspaceId)) redirect("/");');
    expect(ended).toBeGreaterThan(0);
    expect(ended).toBeLessThan(page.indexOf("startOptions(actor, ref)"));
  });
});
