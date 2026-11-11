import "server-only";
import { db } from "@/lib/db";
import { formatValue, periodLabel, periodStart, SOURCE_LABEL } from "@/lib/format";
import { normalizeMetric } from "@/lib/data";
import type { Metric, Profile, SourceId, Token } from "@/lib/types";

export type IntakeInput = {
  source: SourceId;
  /** Slack handle, mail address, or (web form) the token code. */
  sender: string;
  text: string;
  promptId?: number;
};

export type IntakeResult = { outcome: string; detail: string; ok: boolean; metricSlug?: string };

/** Pulls the first number out of a message: "we closed 3 today" → 3, "126,657 €" → 126657. */
export function parseValue(text: string): number | null {
  const m = text.replace(/(\d)[ ,](?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export async function intake(input: IntakeInput): Promise<IntakeResult> {
  const log = async (r: IntakeResult & { senderId?: string | null; metricId?: number | null; token?: string | null; observationId?: number | null }) => {
    await db.from("intake_log").insert({
      source: input.source,
      sender: input.sender,
      sender_id: r.senderId ?? null,
      raw: input.text,
      metric_id: r.metricId ?? null,
      token_code: r.token ?? null,
      outcome: r.outcome,
      detail: r.detail,
      observation_id: r.observationId ?? null,
    });
    return { outcome: r.outcome, detail: r.detail, ok: r.ok, metricSlug: r.metricSlug };
  };

  // 1. Who sent it? The Token is implied by the sender's identity on this Source.
  const [{ data: profiles }, { data: tokens }, { data: metricRows }] = await Promise.all([
    db.from("profiles").select("*"),
    db.from("tokens").select("*"),
    db.from("metrics").select("*"),
  ]);
  const metrics = (metricRows ?? []).map(normalizeMetric) as Metric[];
  const metricById = Object.fromEntries(metrics.map((m) => [m.id, m]));
  let sender: Profile | undefined;
  let candidates: Token[] = [];
  if (input.source === "web_form") {
    const t = (tokens ?? []).find((t) => t.code === input.sender);
    if (!t) return log({ ok: false, outcome: "rejected_no_token", detail: "This form link doesn’t match any Token." });
    sender = profiles?.find((p) => p.id === t.submitter_id);
    candidates = [t];
  } else {
    sender = profiles?.find((p) => (input.source === "slack" ? p.slack_handle : p.email) === input.sender.trim().toLowerCase());
    if (!sender) return log({ ok: false, outcome: "rejected_unknown_sender", detail: `${input.sender} isn’t a known ${SOURCE_LABEL[input.source]} identity of any user.` });
    candidates = (tokens ?? []).filter((t) => t.submitter_id === sender!.id);
  }
  const senderId = sender?.id ?? null;
  if (candidates.length === 0) return log({ ok: false, senderId, outcome: "rejected_no_token", detail: `${sender?.name} has no Token for any metric, so nothing can be recorded.` });

  // 2. Which metric? Prompt reply > metric named in the message (among the sender's own Tokens) > the only Token.
  let token: Token | undefined;
  let prompt: { id: number; metric_id: number; period_start: string } | null = null;
  let how = "";
  if (input.promptId) {
    const { data } = await db.from("prompts").select("*").eq("id", input.promptId).single();
    prompt = data;
    token = candidates.find((t) => t.metric_id === prompt?.metric_id);
    if (!token) return log({ ok: false, senderId, metricId: prompt?.metric_id, outcome: "rejected_no_token", detail: `${sender?.name} has no Token for ${metricById[prompt!.metric_id]?.name}.` });
    how = "reply to a Prompt";
  } else {
    // Only among the sender's own Tokens: a metric matches if a distinctive word of its name appears ("2 more deals" → Deals closed).
    const words = new Set(input.text.toLowerCase().match(/[a-z]+/g) ?? []);
    const stem = (w: string) => w.replace(/s$/, "");
    const named = candidates.filter((t) =>
      (metricById[t.metric_id]?.name.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => w.length >= 4 && [...words].some((x) => stem(x) === stem(w))),
    );
    if (named.length === 1) {
      token = named[0];
      how = "metric named in the message";
    } else if (candidates.length === 1) {
      token = candidates[0];
      how = input.source === "web_form" ? "personal form link" : "sender’s only Token";
    } else {
      const names = candidates.map((t) => metricById[t.metric_id]?.name).join(", ");
      return log({ ok: false, senderId, outcome: "rejected_ambiguous", detail: `${sender?.name} has Tokens for ${names}. Reply to a Prompt or name the metric.` });
    }
  }
  const metric = metricById[token.metric_id];
  const base = { senderId, metricId: metric.id, token: token.code, metricSlug: metric.slug };

  if (metric.formula) return log({ ...base, ok: false, outcome: "rejected_derived", detail: `${metric.name} is a Derived Metric and is computed, never submitted.` });
  if (!metric.sources.includes(input.source))
    return log({ ...base, ok: false, outcome: "rejected_source", detail: `${metric.name} doesn’t accept values from ${SOURCE_LABEL[input.source]}.` });

  // 3. What value, for which period?
  const value = parseValue(input.text);
  if (value === null) return log({ ...base, ok: false, outcome: "rejected_no_value", detail: "Couldn’t find a number in the message." });
  const period = prompt?.period_start ?? periodStart(new Date(), metric.period);
  const fv = (v: number) => formatValue(metric, v);
  const when = periodLabel(period, metric.period);

  // 4. Submission Rule
  const { data: existing } = await db.from("observations").select("*").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false });
  const prev = existing?.[0];
  const row = { metric_id: metric.id, period_start: period, submitter_id: senderId, source: input.source };
  let result: IntakeResult & { observationId?: number };
  if (!prev) {
    const { data } = await db.from("observations").insert({ ...row, value }).select("id").single();
    result = { ok: true, outcome: "recorded", detail: `${fv(value)} recorded for ${metric.name}, ${when} (via ${how}).`, observationId: data?.id };
  } else if (metric.submission_rule === "reject") {
    result = { ok: false, outcome: "rejected_duplicate", detail: `${metric.name} already has ${fv(Number(prev.value))} for ${when}, and its rule rejects a second value.` };
  } else if (metric.submission_rule === "overwrite") {
    await db.from("observations").update({ ...row, value, created_at: new Date().toISOString() }).eq("id", prev.id);
    result = { ok: true, outcome: "overwritten", detail: `Replaced ${fv(Number(prev.value))} with ${fv(value)} for ${metric.name}, ${when}.`, observationId: prev.id };
  } else if (metric.submission_rule === "add") {
    const sum = Number(prev.value) + value;
    await db.from("observations").update({ value: sum }).eq("id", prev.id);
    result = { ok: true, outcome: "added", detail: `${fv(Number(prev.value))} + ${fv(value)} = ${fv(sum)} for ${metric.name}, ${when}.`, observationId: prev.id };
  } else {
    const { data } = await db.from("observations").insert({ ...row, value }).select("id").single();
    result = { ok: true, outcome: "kept_both", detail: `Kept ${fv(value)} alongside ${existing!.length} earlier value(s) for ${metric.name}, ${when}.`, observationId: data?.id };
  }
  if (prompt && result.ok) await db.from("prompts").update({ answered_at: new Date().toISOString() }).eq("id", prompt.id);
  return log({ ...base, ...result });
}
