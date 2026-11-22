// @vitest-environment happy-dom
// The Theme picker asks whose logo it is before a dashboard or deck takes a Theme that shows a Pack's logo (spec 0039,
// ticket #755). The server actions are replaced, so this checks the picker alone; the rule is tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = vi.fn(async (_id: number): Promise<{ pack: string; author: string } | null> => null);
vi.mock("@/app/theme-actions", () => ({ themeLogoSource: (id: number) => source(id) }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as string}</a> }));
import { ThemePicker } from "./theme-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const themes = [{ id: 1, name: "Standard", is_default: true }, { id: 2, name: "Acme board", is_default: false }] as never;
let host: HTMLElement; let root: Root;
const onChange = vi.fn(async (_id: number | null) => undefined);
async function mount() {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<ThemePicker themes={themes} value={null} onChange={onChange} />); });
}
async function pick(v: string) {
  const sel = host.querySelector("select") as HTMLSelectElement;
  await act(async () => { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}
const dialogText = () => document.body.textContent ?? "";
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; onChange.mockClear(); source.mockClear(); });

describe("the Theme picker", () => {
  it("saves at once when the Theme carries no Pack logo", async () => {
    await mount(); await pick("2");
    expect(onChange).toHaveBeenCalledWith(2);
  });
  it("names whose logo it is and saves only after the person agrees", async () => {
    source.mockResolvedValueOnce({ pack: "board-deck", author: "Acme" });
    await mount(); await pick("2");
    expect(dialogText()).toContain("Acme’s logo, from the Pack board-deck");
    expect(onChange).not.toHaveBeenCalled();
    const ok = [...document.querySelectorAll("button")].find((b) => /Use this Theme/.test(b.textContent ?? "")) as HTMLElement;
    await act(async () => { ok.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(onChange).toHaveBeenCalledWith(2);
  });
  it("does not ask when going back to the team default", async () => {
    await mount(); await pick("");
    expect(source).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
