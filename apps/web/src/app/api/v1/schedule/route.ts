// GET /api/v1/schedule (spec 0027, ticket #241; GLOSSARY: Schedule): what the key's creator has to do in the workspace,
// by day, overdue first. Scope metrics:read: every entry is about a Metric they see. The core decides everything;
// this only shapes the answer and makes its paths into links, which carry no secret and need a sign-in.
import { schedule, SpanRefused, type Schedule, type ScheduleEntry } from "@ziffr/core/schedule";
import { ApiError, json, keyRoute, query } from "@/lib/api";
import { ScheduleAnswer, scheduleQuery } from "../schemas";

/** One entry as a program sees it. */
const entry = (req: Request) => (e: ScheduleEntry) => ({
  kind: e.kind, date: e.date, overdue: e.overdue, overdue_working_days: e.overdueWorkingDays,
  metric: { slug: e.metric.slug, name: e.metric.name }, period: { start: e.period.start, name: e.period.label },
  action_id: e.actionId, text: e.text, escalation: e.escalation, standing_in_for: e.standingInFor?.name ?? null,
  no_due_date: e.noDueDate, remind_days_before: e.remindDaysBefore, url: new URL(e.path, req.url).toString(),
});

/** A Schedule in the API's shape. */
function scheduleAnswer(req: Request, s: Schedule) {
  const one = entry(req);
  return ScheduleAnswer.parse({ today: s.today, overdue: s.overdue.map(one), days: s.days.map((d) => ({ date: d.date, entries: d.entries.map(one) })), undated: s.undated.map(one) });
}

/** The key's creator's Schedule. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { from, to } = scheduleQuery.parse(query(req));
  try {
    return json(scheduleAnswer(req, await schedule(actor, { from, to })));
  } catch (e) {
    if (e instanceof SpanRefused) throw new ApiError("invalid_request", e.message);
    throw e;
  }
});
