"use client";
// A Free Layout wherever a widget is drawn (GLOSSARY: Free Layout, Installation Settings). The slide editor that draws
// it is loaded only where this Ziffr has its license key; elsewhere plain words say that it cannot be shown here and
// that it is kept. Nothing about it is changed or sent anywhere either way.
import dynamic from "next/dynamic";
import { useSlideLicense } from "@/decks/slide-license";
import { SlideNotice } from "@/decks/slide-notice";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";

// tldraw is browser-only and large; free layouts load it on demand.
const LayoutView = dynamic(() => import("./layout-view"), { ssr: false });

const HEADING = "This free layout cannot be shown here";

/** The layout, or the words that stand in its place. */
export function FreeLayout({ settings, data }: { settings: WidgetSettings; data: CanvasData }) {
  const license = useSlideLicense();
  if (!license) return <p role="status" className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading…</p>;
  if (license.key) return <LayoutView settings={settings} data={data} />;
  if (license.failed) return <SlideNotice heading={HEADING} words="The page could not load all it needs to draw this. Reload it to try again." />;
  return <SlideNotice heading={HEADING} words="It is kept as it is. This Ziffr has no license key for the slide editor that draws it." admin={license.admin} settings={license.settings} missing />;
}
