// The Widget menu's "Add to…" and "Save as…" (#969): the two groups, their entries in order, and no trace of the old names.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetKeepMenu, type KeepMenuKit } from "./widget-keep-menu";

// Plain elements stand in for the menu primitives, so the structure shows as nested markup.
const K: KeepMenuKit = {
  Item: ({ children }) => <li data-item>{children}</li>,
  Separator: () => <hr />,
  Sub: ({ children }) => <ul data-sub>{children}</ul>,
  SubTrigger: ({ children }) => <li data-trigger>{children}</li>,
  SubContent: ({ children }) => <ul data-content>{children}</ul>,
};
const noop = () => {};
const full = { K, targets: [{ id: 1, name: "Sales" }], saved: true, canSaveTemplate: true, hasDesign: true, onAddToDashboard: noop, onAddToDeck: noop, onSaveWidget: noop, onSaveTemplate: noop, onSaveDesign: noop, onDownloadDesign: noop };
const text = (props: typeof full) => renderToStaticMarkup(<WidgetKeepMenu {...props} />).replace(/<svg[^>]*>.*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

describe("WidgetKeepMenu", () => {
  it("groups by intent, in order, and drops the old group names", () => {
    const t = text(full);
    expect(t).toBe("| Add to…| Dashboard|Sales| Deck…| Save as…| Widget| Template…| View Design| Download View Design file|");
    expect(t).not.toMatch(/Copy to|For View Designs|Export View Design|Duplicate as View Design/);
    expect(renderToStaticMarkup(<WidgetKeepMenu {...full} />)).toContain("<hr/>");
  });
  it("offers only what the person may use", () => {
    expect(text({ ...full, targets: [], saved: false, hasDesign: false })).toBe("| Save as…| Widget|");
    expect(text({ ...full, canSaveTemplate: false, hasDesign: false })).not.toContain("Template");
  });
});
