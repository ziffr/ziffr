-- Indexes for what pages, the API and the scheduled run read most: values by Metric and period (latest first),
-- Actions by person and status, the Outbox, Threads, histories and logs newest first, open Prompts and tasks. Each one
-- is created only if it is missing, so running this twice changes nothing.
create index if not exists observations_ws_metric_period_created_idx on observations (workspace_id, metric_id, period_start, created_at desc);
create index if not exists observations_metric_period_created_idx on observations (metric_id, period_start, created_at desc);

create index if not exists actions_ws_assignee_status_idx on actions (workspace_id, assignee_id, status);
create index if not exists actions_ws_asker_status_idx on actions (workspace_id, asker_id, status);
create index if not exists actions_ws_metric_updated_idx on actions (workspace_id, metric_id, updated_at desc);
create index if not exists actions_open_tasks_due_idx on actions (workspace_id, due_date) where kind = 'task' and status = 'open';

create index if not exists deliveries_ws_id_idx on deliveries (workspace_id, id desc);
create index if not exists deliveries_action_recipient_idx on deliveries (action_id, recipient_id, id);

create index if not exists thread_messages_action_created_idx on thread_messages (action_id, created_at);
create index if not exists versions_ws_updated_idx on versions (workspace_id, updated_at desc);
create index if not exists observation_history_ws_superseded_idx on observation_history (workspace_id, superseded_at desc);

create index if not exists prompts_ws_sent_idx on prompts (workspace_id, sent_at desc);
create index if not exists prompts_unanswered_idx on prompts (metric_id, submitter_id, period_start) where answered_at is null;

create index if not exists intake_log_ws_at_idx on intake_log (workspace_id, at desc);
create index if not exists period_states_waiting_idx on period_states (workspace_id, metric_id) where state in ('approval', 'locked');
create index if not exists widgets_ws_dashboard_idx on widgets (workspace_id, dashboard_id);
create index if not exists tokens_ws_submitter_idx on tokens (workspace_id, submitter_id);
create index if not exists delivery_preferences_ws_kind_user_idx on delivery_preferences (workspace_id, kind, user_id);
create index if not exists breakdown_rows_observation_position_idx on breakdown_rows (observation_id, position);
create index if not exists view_links_ws_object_idx on view_links (workspace_id, object_type, object_id);
