// The Sources a Metric can take values from, built in for now (a plugin seam would go here). The web form is real,
// and so is mail once replies by email are set up (spec 0004); the Sources page simulates Slack and mail messages.
// All feed the core's submitValue (@ziffr/core/submissions), so Tokens and Submission Rules behave for real.
import type { SourceId } from "@ziffr/core/types";

export const SOURCES: { id: SourceId; label: string; simulated: boolean; identity: string }[] = [
  { id: "slack", label: "Slack", simulated: true, identity: "Slack handle" },
  { id: "mail", label: "Mail", simulated: true, identity: "Mail address" },
  { id: "web_form", label: "Web form", simulated: false, identity: "Personal form link" },
  { id: "api", label: "API and Feeds", simulated: false, identity: "Access Key or Feed Key" },
];
