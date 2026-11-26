"use client";
// The deck editor's Element menu (GLOSSARY: Slide Element; spec 0057): adds a Slide Element to the slide in view, at the
// first free spot, selected so that its settings show. Only Metrics the person sees are offered to it.
import { Shapes } from "lucide-react";
import { createShapeId, type Editor } from "tldraw";
import type { CanvasData } from "@ziffr/core/types";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { contentAreas, orderedSlides, SLIDE_H, SLIDE_W } from "../layouts";
import { freeSpot } from "../placement";
import { WIDGET_SHAPE, type WidgetShape } from "../widget-shape";
import { ELEMENT_CHOICES, fitMetrics } from "./element-add";

function addElement(editor: Editor, data: CanvasData, choice: (typeof ELEMENT_CHOICES)[number]) {
  const slides = orderedSlides(editor);
  const target = slides.find((f) => editor.getShapePageBounds(f)!.collides(editor.getViewportPageBounds())) ?? slides[0];
  if (!target) return;
  const fb = editor.getShapePageBounds(target)!;
  const taken = editor.getSortedChildIdsForParent(target.id).map((child) => {
    const b = editor.getShapePageBounds(child)!;
    return { x: b.x - fb.x, y: b.y - fb.y, w: b.w, h: b.h };
  });
  const spot = freeSpot(contentAreas()[0], taken, { w: choice.w, h: choice.h }, { w: SLIDE_W, h: SLIDE_H });
  const all = data.metrics.map((m) => m.id);
  const metricIds = fitMetrics(choice.element, all.slice(0, choice.metrics), all);
  const id = createShapeId();
  editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, parentId: target.id, x: spot.x, y: spot.y, props: { w: choice.w, h: choice.h, template: "slide", metricIds, settings: JSON.stringify({ element: choice.element }), title: "" } });
  editor.select(id);
}

/** The button that offers every kind of Slide Element; off until the editor is there. */
export function ElementMenu({ editor, data }: { editor: Editor | null; data: CanvasData }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })} disabled={!editor}><Shapes aria-hidden /> Element</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add to the slide in view</DropdownMenuLabel>
          {ELEMENT_CHOICES.map((c) => (
            // Added once the menu has closed and given the focus back.
            <DropdownMenuItem key={c.kind} disabled={data.metrics.length < c.metrics} onClick={() => setTimeout(() => editor && addElement(editor, data, c), 0)}>
              <span className="flex flex-col">
                <span>{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.blurb}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
