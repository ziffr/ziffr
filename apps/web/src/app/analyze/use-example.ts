"use client";
// The example question of an empty canvas, asked of the core once (GLOSSARY: Analysis Canvas): the list the picker gives for the Metrics
// with the most values, of which `pickExample` takes one. A failure or a Workspace with too little to fit means no example.
import { useEffect, useState } from "react";
import type { CanvasData } from "@ziffr/core/types";
import { pickerList } from "@/app/picker-actions";
import { exampleCandidates, pickExample, type Example } from "./example";

/** The example for these Metrics, or null while it is not known, when nothing fits, and when `wanted` is false (the canvas has Metrics). */
export function useExample(data: Pick<CanvasData, "metrics" | "series">, wanted: boolean): Example | null {
  const candidates = exampleCandidates(data);
  const key = candidates.join(",");
  const [found, setFound] = useState<{ key: string; example: Example | null } | null>(null);
  useEffect(() => {
    if (!wanted || candidates.length < 2) return;
    let live = true;
    pickerList(candidates, candidates[0]).then((l) => { if (live) setFound({ key, example: pickExample(l) }); }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the candidates
  }, [key, wanted]);
  return wanted && found?.key === key ? found.example : null;
}
