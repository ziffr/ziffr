-- Alerts also send to a Personal Webhook (spec 0037, ticket #644; GLOSSARY: Alert, Personal Webhook): an Alert names up to
-- three of its person's own Personal Webhooks, and each crossing writes an `alert.fired` send for them. The ids are
-- checked by the core against the person's own Webhooks when named and again at every send, so a stale id (a Webhook
-- deleted since) matches nothing. No new table, so nothing for the demo guard.
alter table alerts add column webhook_ids uuid[] not null default '{}' check (cardinality(webhook_ids) <= 3);

-- A send of `alert.fired` for a Personal Webhook points at the Alert that fired, so its message is built from that Alert's
-- condition at send time. Set null (not cascade) so the Webhook's log keeps the status of a send whose Alert was deleted.
alter table webhook_sends add column alert_id bigint references alerts(id) on delete set null;
