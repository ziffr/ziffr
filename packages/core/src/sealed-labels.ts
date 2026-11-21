// The words the Installation Settings page uses for each sealed column (spec 0028, ticket #247; GLOSSARY: Workspace Key).
// Pure, with no imports, so a client component may use it; a test keeps it, SEALED_COLUMNS and the job's SQL in step.

/** The columns' words, as the page says them; a test keeps this list, SEALED_COLUMNS and the job's SQL in step. */
export const SEALED_LABELS: Record<string, string> = {
  "thread_messages.body": "Thread messages", "actions.question": "Questions and Tasks", "actions.breakdown_label": "Breakdown rows Actions point at", "contacts.email": "Contacts' addresses", "contacts.slack_handle": "Contacts' Slack handles",
  "contacts.phone": "Contacts' phone numbers", "profiles.name": "Contacts' names", "prompts.text": "Prompt texts", "deliveries.subject": "Outbox subjects", "deliveries.body": "Outbox texts",
  "intake_log.sender": "Intake senders", "intake_log.raw": "Intake texts", "intake_log.detail": "Intake details", "audit_events.object_name": "Audit Log names",
  "audit_events.details": "Audit Log details", "alerts.level": "Alert levels", "webhooks.url": "Webhook addresses", "webhooks.secret": "Webhook secrets", "webhooks.secret_previous": "Webhook previous secrets", "condensed_values.payload": "Condensed values", "dashboards.intro": "Dashboard introductions", "widgets.title": "Widget titles", "metrics.description": "Metric descriptions", "webhook_external_ids.external_id": "External task ids", "webhook_external_ids.url": "External task addresses",
  "breakdown_rows.label": "Breakdown labels", "breakdown_history.label": "Breakdown label history", "widgets.settings": "Finding words", "dashboard_snapshots.words": "Snapshot words", "dashboard_snapshots.frozen": "Snapshot Breakdown labels",
  "versions.snapshot": "Version words", "view_links.frozen": "View Link copies", "view_links.snapshot_words": "View Link Snapshot words",
  "metrics.name": "Metric names", "metrics.target_min": "Metric targets (from)", "metrics.target_max": "Metric targets (to)", "thread_messages.correction_value": "Proposed Corrections",
  "observations.value": "Values", "observations.original_value": "Values before a Correction", "observation_history.value": "Replaced values", "breakdown_rows.value": "Breakdown row values",
  "breakdown_history.value": "Replaced Breakdown row values", "series_values.value": "Targets and Projections",
};
