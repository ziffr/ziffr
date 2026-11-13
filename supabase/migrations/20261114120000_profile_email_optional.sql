-- A person's email is only kept once it is verified (ADR 0003). Someone who signs in through a provider that gives
-- no verified address has none yet, so the column may be empty; it stays unique where it is set.
alter table profiles alter column email drop not null;
