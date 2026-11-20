// GET /api/v1/schedule (spec 0027, tickets #241 and #244; GLOSSARY: Schedule): what the key's creator has to do in the
// workspace, by day, overdue first, or, for an Owner or Admin, a teammate's (`person_id`), limited to the Metrics the
// key's creator sees too. Scope metrics:read: every entry is about a Metric they see; the role decides the rest. The core decides everything;
// this only shapes the answer and makes its paths into links, which carry no secret and need a sign-in.
import { Forbidden } from "@ziffr/core/actor";
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
  return ScheduleAnswer.parse({ today: s.today, person_id: s.personId, overdue: s.overdue.map(one), days: s.days.map((d) => ({ date: d.date, entries: d.entries.map(one) })), undated: s.undated.map(one) });
}

/** The key's creator's Schedule, or a teammate's for an Owner or Admin. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { from, to, person_id } = scheduleQuery.parse(query(req));
  try {
    return json(scheduleAnswer(req, await schedule(actor, { from, to, personId: person_id })));
  } catch (e) {
    if (e instanceof SpanRefused) throw new ApiError("invalid_request", e.message);
    // A Member or Guest naming someone else is refused with the reason; a person not in the workspace stays "not found".
    if (e instanceof Forbidden && e.message !== "Forbidden") throw new ApiError("forbidden", e.message);
    throw e;
  }
});
