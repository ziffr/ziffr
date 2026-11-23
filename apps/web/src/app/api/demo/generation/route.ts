// GET /api/demo/generation (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 7): which Generation the demo is in and when it
// is next due to start fresh, for the line on every demo page to learn that a reset happened. A number and two times, no
// data of the demo and of nobody; it needs only the demo's cookie (isDemo), and answers a bare 404 to anyone else and
// wherever visitors may not change the demo (the line is not shown there). A short private cache keeps open pages from
// asking more than a few times, and the page spreads its asks (demo-reset-line.ts).
import { demoChangesInEffect } from "@ziffr/core/demo-reset-decision";
import { demoLineFacts } from "@ziffr/core/demo-line";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { isDemo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The demo's Generation and next reset, for a demo visit. */
export async function GET() {
  if (!(await isDemo()) || !demoChangesInEffect(await settingsInEffect())) return new Response(null, { status: 404 });
  const facts = await demoLineFacts();
  if (!facts) return new Response(null, { status: 404 });
  return Response.json({ generation: facts.generation, resetAt: facts.resetAt, nextResetAt: facts.nextResetAt }, { headers: { "cache-control": "private, max-age=2" } });
}
