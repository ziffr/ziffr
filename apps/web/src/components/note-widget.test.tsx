// @vitest-environment happy-dom
// The Note Widget on screen (GLOSSARY: Note Widget; #1359): its words are drawn as text only, with lists, and it is
// written in its own card by those who may. Server actions are replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { Widget } from "@ziffr/core/types";
import { NoteBody } from "@/views/note-view";
import { NoteEditor } from "./note-editor";
import { ReadOnlyFrame } from "./read-only-frame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
async function mount(node: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(node); });
}
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });

const hostile = '<img src=x onerror="alert(1)">\n- <a href="javascript:alert(1)">click</a>\n- [link](https://example.org)\n\n1. {latest}\n\n<script>alert(1)</script>';
const note = { id: 5, template: "note", metric_ids: [], title: "Why {metric} dipped", settings: { note: hostile, noteHighlight: true } } as unknown as Widget;
const data = sampleCanvasData("sara", "1,234.5");

describe("a note's words", () => {
  it("are text only: no markup, no link, nothing that runs, also through a View Link", async () => {
    await mount(<ReadOnlyFrame widget={note} data={data} />);
    expect(host.querySelectorAll("img, a, script, iframe")).toHaveLength(0);
    expect(host.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(host.textContent).toContain("<script>alert(1)</script>");
    expect(host.querySelectorAll("ul li")).toHaveLength(2);
    expect(host.querySelectorAll("ol li")).toHaveLength(1);
    // Its heading and words are shown as written: a note fills nothing in from the data.
    expect(host.textContent).toContain("Why {metric} dipped");
    expect(host.textContent).toContain("{latest}");
    expect(host.querySelector(".note-highlight")).not.toBeNull();
    expect(host.textContent).toContain("Highlighted");
  });

  it("draw nothing, and do not fail, for what is not words", async () => {
    await mount(<NoteBody settings={{ note: { toString: 1 } as unknown as string }} />);
    expect(host.textContent).toBe("");
  });
});

describe("writing a note", () => {
  const set = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("saves the heading, the words and the look, and gives up with Escape", async () => {
    const onSave = vi.fn(); const onCancel = vi.fn();
    await mount(<NoteEditor widget={{ title: null, settings: {} }} pending={false} onSave={onSave} onCancel={onCancel} />);
    const text = host.querySelector("textarea")!;
    expect(document.activeElement).toBe(text);
    await set(host.querySelector<HTMLInputElement>("input[aria-label='Heading']")!, "  Why  ");
    await set(text, "Because\n- one");
    await act(async () => { host.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(); });
    await act(async () => { host.querySelector<HTMLButtonElement>("button[type=submit]")!.click(); });
    expect(onSave).toHaveBeenCalledWith({ title: "Why", settings: { note: "Because\n- one", noteHighlight: true } });
    await act(async () => { text.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(onCancel).toHaveBeenCalled();
  });
});
