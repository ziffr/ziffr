"use client";
import dynamic from "next/dynamic";
import type { CanvasData, Master, Widget } from "@/lib/types";
import { Bone } from "@/components/skeleton";

// tldraw is browser-only.
const DeckEditor = dynamic(() => import("./editor").then((m) => m.DeckEditor), {
  ssr: false,
  loading: () => <Bone className="h-[calc(100vh-12rem)] w-full" />,
});

export function DeckEditorLoader(props: { deck: { id: number; name: string; document: unknown; master_id: number | null; theme_id: number | null }; data: CanvasData; saved: Widget[]; masters: Master[] }) {
  return <DeckEditor {...props} />;
}
