"use client";
// Cloudflare Turnstile on the sign-in form (spec 0021, ticket 8): draws the check and hands its answer to the form,
// which sends it with the request for a link. The server checks the answer; this only collects it.
import { useEffect, useRef } from "react";

type TurnstileApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The check; `onAnswer` gets its answer, or null when it expires or fails. `resetKey` draws it again after a refusal. */
export function Turnstile({ siteKey, onAnswer, resetKey }: { siteKey: string; onAnswer: (answer: string | null) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | null = null;
    let gone = false;
    const draw = () => {
      if (gone || !box.current || !window.turnstile) return;
      widget = window.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (t: string) => onAnswer(t),
        "expired-callback": () => onAnswer(null),
        "error-callback": () => onAnswer(null),
      });
    };
    if (window.turnstile) draw();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!s) { s = document.createElement("script"); s.src = SCRIPT; s.async = true; document.head.appendChild(s); }
      s.addEventListener("load", draw);
    }
    return () => { gone = true; if (widget && window.turnstile) window.turnstile.remove(widget); };
  }, [siteKey, onAnswer, resetKey]);
  return <div ref={box} className="min-h-[65px]" />;
}
