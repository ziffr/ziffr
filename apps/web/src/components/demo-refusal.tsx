"use client";
// A change refused in the demo (GLOSSARY: Demo Mode) says so with the way to a trial, where this Ziffr offers them.
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { DEMO_READ_ONLY, DEMO_READ_ONLY_TRIAL } from "@ziffr/core/demo-words";

/** The refusal's words with the link to a trial of one's own. A full page load, as "Leave the demo" is (#14). */
export function DemoRefusalWords({ words = DEMO_READ_ONLY }: { words?: string }) {
  return <>{words}{" "}<a href="/demo/leave" className="underline underline-offset-2">Try it with a trial of your own</a>.</>;
}

/** Makes every error toast that carries the demo's trial sentence show the link too, so no screen has to know. The
 * sentence is matched exactly, so no other toast changes, and no text from a server is ever drawn as markup. */
export function DemoRefusalLinks(): ReactNode {
  useEffect(() => {
    const original = toast.error;
    toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) =>
      original(message, data?.description === DEMO_READ_ONLY_TRIAL ? { ...data, description: <DemoRefusalWords /> } : data)) as typeof toast.error;
    return () => { toast.error = original; };
  }, []);
  return null;
}
