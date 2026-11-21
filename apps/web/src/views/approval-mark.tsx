"use client";
// Approval and Lock marks (GLOSSARY: Approval, Lock): whether a value waits for Approval or is locked, wherever a
// value is shown.
import { Lock } from "lucide-react";
import type { CanvasData } from "@ziffr/core/types";

/** The mark itself on a value that waits for Approval, for pages that know the waiting periods without CanvasData. */
export function NotApprovedMark({ short }: { short?: boolean }) {
  return <span title="Not approved yet" className="rounded-[var(--radius-input)] border border-dashed border-[var(--color-accent-2)] px-1 text-xs leading-4 text-[var(--color-accent-2)]">{short ? "unapproved" : "not approved yet"}</span>;
}

/** Whether a value waits for Approval or is locked (GLOSSARY: Approval, Lock), wherever a value is shown. */
export function ApprovalMark({ data, metricId, period, through, short }: { data: CanvasData; metricId: number; period: string; through?: string; short?: boolean }) {
  // A span shown by a Display Period (`through` set) waits while any of its periods does; it is never one locked period.
  if (through !== undefined ? data.pending?.[metricId]?.some((p) => p >= period && p <= through) : data.pending?.[metricId]?.includes(period))
    return <NotApprovedMark short={short} />;
  if (through === undefined && data.locked?.[metricId]?.includes(period)) return <Lock aria-label="Locked" className="size-3" />;
  return null;
}
