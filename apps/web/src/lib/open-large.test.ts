// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { largeHref, opensLarge } from "./open-large";

function card(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe("opensLarge", () => {
  it("opens on the card's body", () => {
    const c = card(`<p id="t">Revenue</p><svg><rect id="bg"/></svg>`);
    expect(opensLarge(c.querySelector("#t"), c)).toBe(true);
    expect(opensLarge(c.querySelector("#bg"), c)).toBe(true);
  });
  it("leaves menus, links, controls and inputs alone, also their children", () => {
    const c = card(`<button id="b"><span id="s">x</span></button><a id="a" href="#">l</a><input id="i"/><div role="menuitem"><i id="m"></i></div><div data-no-open><i id="n"></i></div>`);
    for (const id of ["b", "s", "a", "i", "m", "n"]) expect(opensLarge(c.querySelector(`#${id}`), c), id).toBe(false);
  });
  it("leaves data points and their popup alone", () => {
    const c = card(`<svg><circle id="d" class="recharts-dot"/></svg><div role="tooltip"><b id="tip"></b></div>`);
    expect(opensLarge(c.querySelector("#d"), c)).toBe(false);
    expect(opensLarge(c.querySelector("#tip"), c)).toBe(false);
  });
  it("ignores what is outside the card (a portal)", () => {
    const c = card(`<p>in</p>`);
    const out = card(`<p id="o">out</p>`);
    expect(opensLarge(out.querySelector("#o"), c)).toBe(false);
    expect(opensLarge(null, c)).toBe(false);
  });
  it("opens when the card itself is the target", () => {
    const c = card(``);
    expect(opensLarge(c, c)).toBe(true);
  });
});

describe("largeHref", () => {
  it("names the dashboard and the widget", () => expect(largeHref(3, 12)).toBe("/dashboards/3/present?view=one&at=12"));
});
