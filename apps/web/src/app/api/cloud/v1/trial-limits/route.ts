// GET and PUT /api/cloud/v1/trial-limits (spec 0040, ticket 2): Ziffr Cloud reads and sets the Trial Limits, the numbers
// that bound every Trial Workspace. PUT changes the limits it names: a whole number within its range sets one, null gives it back to its
// default (the days: no trials), a limit left out stays as it is. Checked with zod (unknown names refused), at most 4 KB. Numbers only: the
// answer holds nothing of any trial.
import { z } from "zod";
import { cloudTrialLimits, setCloudTrialLimits } from "@ziffr/core/cloud-api";
import { TRIAL_LIMITS } from "@ziffr/core/trial-limits";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

const Body = z.object(Object.fromEntries(TRIAL_LIMITS.map((l) => [l.key, z.number().int().min(l.min).max(l.max).nullable().optional()]))).strict();

/** The Trial Limits in effect and where each comes from. */
export const GET = cloudRoute(async (caller) => cloudJson(await cloudTrialLimits(caller)));

/** Sets the Trial Limits. */
export const PUT = cloudRoute(async (caller, body) => {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return cloudJson({ error: { code: "invalid_request", message: "The body is not valid JSON." } }, 400); }
  return cloudJson(await setCloudTrialLimits(caller, Body.parse(parsed)));
});
