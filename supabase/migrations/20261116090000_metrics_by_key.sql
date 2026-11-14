-- Metrics created by programs (spec 0003, ticket #66; GLOSSARY: Access Key). A Metric a key created names the key, and
-- a key creates at most 50 in any 24 hours. The cap is kept here, not in the app: the trigger takes the key's row
-- lock first, so parallel creations with one key wait for each other and cannot all pass the count.
alter table metrics add column access_key_id bigint references access_keys(id) on delete set null;
create index on metrics (access_key_id, created_at) where access_key_id is not null;

create or replace function metrics_per_key_per_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.access_key_id is null then return new; end if;
  perform 1 from access_keys where id = new.access_key_id for update;
  if (select count(*) from metrics where access_key_id = new.access_key_id and created_at > now() - interval '24 hours') >= 50 then
    raise exception using errcode = 'ZF429', message = 'metrics_per_day';
  end if;
  return new;
end $$;

create trigger metrics_per_key_per_day before insert on metrics
  for each row execute function metrics_per_key_per_day();
