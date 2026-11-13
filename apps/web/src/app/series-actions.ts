"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { periodStart } from "@ziffr/core/format";
import type { Period } from "@ziffr/core/types";

// GLOSSARY: Target Series, Projection. Uploaded like observations: one "period value" line each.

/** "2026-12 140000", "2026-12-01;140.000", "12/2026 140000" → period start and value. */
function parseLine(line: string, period: Period): { period: string; value: number } | null {
  const m = line.trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?[\s;,\t]+(-?[\d.,' ]+)$/) ?? line.trim().match(/^(\d{1,2})\/(\d{4})[\s;,\t]+(-?[\d.,' ]+)$/);
  if (!m) return null;
  const [y, mo, d, raw] = m.length === 5 && m[1].length === 4 ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 1), m[4]] : [Number(m[2]), Number(m[1]), 1, m[3]];
  let num = raw.replace(/[' ]/g, "");
  if (/,\d{1,2}$/.test(num)) num = num.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, "");
  else num = num.replace(/,/g, "");
  const value = Number(num);
  if (!Number.isFinite(value) || mo < 1 || mo > 12) return null;
  return { period: periodStart(new Date(y, mo - 1, d), period), value };
}

export async function uploadSeries(metricId: number, kind: "target" | "projection", text: string, note: string) {
  const viewer = await viewerId();
  const { data: m } = await db.from("metrics").select("owner_id, period, slug").eq("id", metricId).single();
  if (!m || m.owner_id !== viewer) throw new Error("Only the metric owner can upload targets and projections");
  if (kind !== "target" && kind !== "projection") throw new Error("Unknown series");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => parseLine(l, m.period as Period));
  const ok = rows.filter((r): r is { period: string; value: number } => r !== null);
  if (ok.length) {
    const { error } = await db.from("series_values").upsert(
      ok.map((r) => ({ metric_id: metricId, kind, period_start: r.period, value: r.value, note: note.slice(0, 120) || null })),
      { onConflict: "metric_id,kind,period_start" },
    );
    if (error) throw new Error(error.message);
  }
  revalidatePath("/", "layout");
  return { saved: ok.length, skipped: lines.length - ok.length };
}
