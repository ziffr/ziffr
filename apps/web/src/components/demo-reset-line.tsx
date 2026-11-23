"use client";
// The demo's countdown (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 7): the end of the line on every demo page, "Resets
// in 9 min." and "Starting fresh." It also writes the Generation its page was drawn in to a cookie, so a change from this page
// says which Generation it knew (the database refuses one from before the last reset). It counts in the browser from the
// server's time, never from the visitor's clock alone, and asks the server once, spread out, after the slot has passed.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clockSkew, demoLine, demoLineWords, generationCheckDelay, slotAfter, type DemoLineFacts } from "@ziffr/core/demo-reset-line";
import { DEMO_GENERATION_COOKIE } from "@/lib/demo-visit-cookie";

/** The countdown words for the demo bar; the page redraws (new facts, new key) when the Generation moves. */
export function DemoResetLine({ generation, resetAt, nextResetAt, serverNow }: DemoLineFacts) {
  const router = useRouter();
  // The first draw is the server's, so the page hydrates to the same words.
  const [now, setNow] = useState(serverNow);
  const [next, setNext] = useState(nextResetAt);

  // The Generation of this page travels with the visit's changes; written again whenever the page is drawn for a new one.
  useEffect(() => {
    try { document.cookie = `${DEMO_GENERATION_COOKIE}=${generation}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* a browser without cookies: changes then refuse as stale */ }
  }, [generation]);

  // The countdown: every 10 seconds, every second in the last minutes. Cheap, and it makes no request.
  useEffect(() => {
    const skew = clockSkew(serverNow, Date.now());
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + skew;
      setNow(t);
      timer = setTimeout(tick, next - t < 90_000 ? 1000 : 10_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [serverNow, next]);

  // After the slot: ask whether the Generation moved, a few times, spread; a clean demo is not reset, so then count to the next slot.
  const due = now >= next;
  useEffect(() => {
    if (!due) return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const ask = async () => {
      if (stopped) return;
      // A tab nobody looks at asks nothing; it asks once when it is shown again.
      if (document.hidden) { document.addEventListener("visibilitychange", ask, { once: true }); return; }
      try {
        const res = await fetch("/api/demo/generation", { credentials: "same-origin" });
        const body = res.ok ? ((await res.json()) as { generation?: number }) : null;
        if (body && typeof body.generation === "number" && body.generation !== generation) { router.refresh(); return; }
      } catch { /* offline: try again below */ }
      attempt += 1;
      const delay = generationCheckDelay(attempt, Math.random());
      if (delay === null) { setNext(slotAfter(next)); return; }
      timer = setTimeout(ask, delay);
    };
    timer = setTimeout(ask, generationCheckDelay(0, Math.random()) ?? 3000);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", ask); };
  }, [due, next, generation, router]);

  return <span>{" "}{demoLineWords(demoLine({ resetAt, nextResetAt: next }, now))}</span>;
}
