// PROTOTYPE: Sources are hardcoded. Slack and Mail are simulated; the web form is real.
// All three feed the same intake (./intake.ts), so Tokens and Submission Rules behave for real.
import type { SourceId } from "@/lib/types";

export const SOURCES: { id: SourceId; label: string; simulated: boolean; identity: string }[] = [
  { id: "slack", label: "Slack", simulated: true, identity: "Slack handle" },
  { id: "mail", label: "Mail", simulated: true, identity: "Mail address" },
  { id: "web_form", label: "Web form", simulated: false, identity: "Personal form link" },
];
