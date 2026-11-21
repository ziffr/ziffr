"use client";
// Your profile (docs/specs/0036-app-layout.md): the switch back to the classic top bar (kept for one release, #511). The choice is a cookie of this
// browser, set here; nothing is saved on the server.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { LAYOUT_COOKIE } from "@/lib/layout-cookie";

/** "Use the classic top bar": a checkbox that sets this browser's layout and redraws the page. */
export function LayoutSwitch({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const change = (next: boolean) => {
    setOn(next);
    try { document.cookie = `${LAYOUT_COOKIE}=${next ? "top" : "sidebar"}; path=/; max-age=31536000; samesite=lax`; } catch { /* a blocked cookie keeps the old layout */ }
    router.refresh();
  };
  return (
    <div className="max-w-xl border-t border-border pt-6">
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={on} onCheckedChange={(v) => change(v === true)} className="mt-0.5" />
        <span>
          <span className="font-medium">Use the classic top bar</span>
          <span className="block text-muted-foreground">The sidebar is the layout now. Tick this to keep the top bar for a while; it applies to this browser only and goes away in a later release.</span>
        </span>
      </label>
    </div>
  );
}
