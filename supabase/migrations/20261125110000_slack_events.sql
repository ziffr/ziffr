-- Receiving from Slack (spec 0007, ticket #104; GLOSSARY: Delivery, Thread, Prompt). Every event Slack sends is
-- claimed once by its event_id before anything else, so Slack's retries change nothing. It keeps what was done with
-- it and for which Delivery, never the message itself.
create table if not exists slack_events (
  id bigint generated always as identity primary key,
  event_id text not null unique check (event_id ~ '^[A-Za-z0-9]{3,40}$'),
  team_id text not null check (char_length(team_id) <= 24),
  workspace_id uuid references workspaces(id) on delete cascade,
  delivery_id bigint references deliveries(id) on delete set null,
  received_at timestamptz not null default now(),
  outcome text not null check (char_length(outcome) <= 40)
);
create index if not exists slack_events_delivery on slack_events (delivery_id, received_at);
alter table slack_events enable row level security;
