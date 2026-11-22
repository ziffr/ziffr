-- The Webhook a Thread message came through, by id (spec 0037, review of ticket 7): the hourly limit and the repeat
-- check count by it, not by the label in `via`, which is only for display and is made of names a person chooses.
alter table thread_messages add column via_webhook_id uuid references webhooks(id) on delete set null;
create index thread_messages_via_webhook_idx on thread_messages (action_id, via_webhook_id, created_at) where via_webhook_id is not null;
