"use client";
// The layout size of an element, followed as it changes (GLOSSARY: Widget): what a chart drawn in SVG needs to be laid out to the
// pixels of the card it is in, from a phone to a wall screen. It reads the layout size (clientWidth and clientHeight), not the
// box on screen: a Preview scales its whole widget down with a transform, which would make a chart in a small Preview look too
// small to draw. Zero until the element is measured (the first render on the server): draw a nominal size then.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** A ref for the element to follow, and its width and height in pixels. */
export function useBoxSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setSize((o) => (o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
