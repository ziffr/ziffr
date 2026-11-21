// The words the Installation Settings page uses for each sealed column (spec 0028, ticket #247; GLOSSARY: Workspace Key).
// Pure, with no imports, so a client component may use it; a test keeps it, SEALED_COLUMNS and the job's SQL in step.

/** The columns' words, as the page says them; a test keeps this list, SEALED_COLUMNS and the job's SQL in step. */
export const SEALED_LABELS: Record<string, string> = {
  "thread_messages.body": "Thread messages", "actions.question": "Questions and Tasks", "actions.breakdown_label": "Breakdown rows Actions point at", "contacts.email": "Contacts' addresses", "contacts.slack_handle": "Contacts' Slack handles",
  "contacts.phone": "Contacts' phone numbers", "profiles.name": "Contacts' names", "deliveries.subject": "Outbox subjects", "deliveries.body": "Outbox texts",
  "intake_log.sender": "Intake senders", "intake_log.raw": "Intake texts", "intake_log.detail": "Intake details", "audit_events.object_name": "Audit Log names",
  "audit_events.details": "Audit Log details", "alerts.level": "Alert levels", "webhooks.url": "Webhook addresses", "webhooks.secret": "Webhook secrets", "webhooks.secret_previous": "Webhook previous secrets", "dashboards.intro": "Dashboard introductions", "widgets.title": "Widget titles", "metrics.description": "Metric descriptions", "webhook_external_ids.external_id": "External task ids", "webhook_external_ids.url": "External task addresses",
};
