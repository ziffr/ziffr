-- Signed withdrawals (spec 0059; GLOSSARY: Withdrawn Pack, Signed Statement). A Pack is withdrawn, or a withdrawal
-- taken back, only by a statement a trusted Marketplace Key signed, with a sequence number that is higher in every
-- later statement about the same Pack. The newest one seen is kept with its text and signature; a row stays once the
-- withdrawal is taken back, so that an older statement cannot return. A row without a state was kept before statements
-- were signed and is not believed. Still the Installation's table: no workspace_id, no browser role.
alter table marketplace_withdrawals
  add column state text check (state in ('withdrawn', 'restored')),
  add column sequence bigint check (sequence >= 1),
  add column key_id text check (key_id ~ '^[0-9a-f]{32}$'),
  add column signed_at timestamptz,
  add column statement text check (char_length(statement) between 1 and 4096),
  add column signature text check (char_length(signature) <= 100),
  add constraint marketplace_withdrawals_signed check (state is null or (sequence is not null and key_id is not null and signed_at is not null and statement is not null and signature is not null and (state = 'restored' or reason is not null)));
-- A withdrawal taken back gives no reason.
alter table marketplace_withdrawals alter column reason drop not null;
