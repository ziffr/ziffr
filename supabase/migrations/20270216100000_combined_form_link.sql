-- The combined form's link (spec 0064, ticket 4; GLOSSARY: Combined Prompt): the code in /submit/all/<code>, made when a
-- Combined Prompt is sent. Only its hash is kept, so nothing here opens the form. It is no Token: it stands for the
-- figures of its one message, each checked against its own Token at every use. Nothing writes this table while combining
-- is switched off. Adds only.
create table combined_form_links (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delivery_id bigint not null references deliveries(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on combined_form_links (delivery_id);
create index on combined_form_links (workspace_id);
alter table combined_form_links enable row level security;
revoke all on table combined_form_links from public, anon, authenticated;

select attach_demo_guard('combined_form_links');
insert into demo_closed_tables (table_name, reason) values
  ('combined_form_links', 'Closed on purpose: the demo asks for each figure in a message of its own, so it has no combined form.')
on conflict (table_name) do nothing;

-- How often a message's form was sent in the running hour. Counted on the message, not on a code: a message edited in a
-- chat carries a further code, which must not bring a further allowance.
alter table deliveries add column form_tries integer not null default 0;
alter table deliveries add column form_tries_since timestamptz;

-- Counts one try and says whether it may go on. One statement, so two at once cannot both take the last place.
create function claim_combined_form_try(p_delivery bigint, p_limit integer) returns boolean
language sql security definer set search_path = public as $$
  with claimed as (
    update deliveries set
      form_tries = case when form_tries_since > now() - interval '1 hour' then form_tries + 1 else 1 end,
      form_tries_since = case when form_tries_since > now() - interval '1 hour' then form_tries_since else now() end
    where id = p_delivery and combined
      and (form_tries_since is null or form_tries_since <= now() - interval '1 hour' or form_tries < p_limit)
    returning 1
  )
  select exists (select 1 from claimed);
$$;
revoke all on function claim_combined_form_try(bigint, integer) from public, anon, authenticated;
grant execute on function claim_combined_form_try(bigint, integer) to service_role;
