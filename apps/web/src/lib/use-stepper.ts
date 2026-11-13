"use client";
// Stepping through a sequence the way presentations do: arrow keys, space, page keys, swipes.
import { useCallback, useEffect, useRef, useState } from "react";

export function useStepper(count: number, start = 0, onEscape?: () => void) {
  const clamp = useCallback((n: number) => Math.min(Math.max(0, n), Math.max(0, count - 1)), [count]);
  const [i, setI] = useState(() => clamp(start));
  const go = useCallback((n: number) => setI(clamp(n)), [clamp]);
  const next = useCallback(() => setI((x) => clamp(x + 1)), [clamp]);
  const prev = useCallback(() => setI((x) => clamp(x - 1)), [clamp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(count - 1);
      else if (e.key === "Escape" && !document.fullscreenElement) onEscape?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go, count, onEscape]);
  // Horizontal swipes on touch screens; vertical movement stays scrolling.
  const from = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") from.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: React.PointerEvent) => {
      const f = from.current;
      from.current = null;
      if (!f) return;
      const dx = e.clientX - f.x, dy = e.clientY - f.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
    },
  };
  return { i, go, next, prev, swipe };
}

/** Full screen on request, and whether it is on. */
export function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const toggle = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    p?.catch(() => {});
  };
  return { on, toggle };
}
