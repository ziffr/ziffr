-- Totals in messages that wait to be sent (spec 0058, #1225; GLOSSARY: Total, Delivery). A message that quotes a Total,
-- or a formula that reads one, keeps which Metrics were counted in each period it quotes, ids only, as a Snapshot does:
-- it is judged again when it is sent and whenever the Outbox lists it, also where a counted Metric has since left the
-- Total. Never sent to a browser.
alter table deliveries add column if not exists total_rests jsonb
  check (total_rests is null or (jsonb_typeof(total_rests) = 'object' and pg_column_size(total_rests) <= 100000));
