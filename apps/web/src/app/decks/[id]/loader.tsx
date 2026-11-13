"use client";
import dynamic from "next/dynamic";
import type { CanvasData, Group, Share, Widget } from "@ziffr/core/types";
import { Bone } from "@/components/skeleton";

// tldraw is browser-only.
const DeckEditor = dynamic(() => import("./editor").then((m) => m.DeckEditor), {
  ssr: false,
  loading: () => <Bone className="h-[calc(100vh-12rem)] w-full" />,
});

export function DeckEditorLoader(props: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; saved: Widget[]; sharing: { shares: Share[]; groups: Group[]; ownerId: string; reveals: Record<string, string[]> } | null }) {
  return <DeckEditor {...props} />;
}
