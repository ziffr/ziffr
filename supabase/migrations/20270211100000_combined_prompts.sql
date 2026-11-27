-- Combined Prompts (spec 0064, ticket 3; GLOSSARY: Combined Prompt, Prompt, Delivery): one message that carries several
-- Prompts to one person. Each figure stays a Prompt row of its own; the list below says which ones a Delivery carries,
-- with each one's number in the message, its Token and where its answer is recorded from. Nothing writes either yet: the
-- core keeps combining switched off until replies to such a message are read (spec 0064, ticket 5).

-- A Combined Prompt names no single Prompt and no single form link, so whatever reads those finds nothing in it.
alter table deliveries add column combined boolean not null default false;
alter table deliveries add constraint deliveries_combined_check check (not combined or (kind = 'prompt' and prompt_id is null and form_token_id is null));

-- The key is a number of its own on purpose: with the Delivery and the Prompt in the primary key, the API would read this
-- table as a second relation between the two, and every query that embeds a Delivery's Prompt would fail as ambiguous,
-- also in a running app of the version before.
create table delivery_prompts (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  delivery_id bigint not null references deliveries(id) on delete cascade,
  prompt_id int not null references prompts(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  -- The Token the person is asked by. Removing it (a removed Submitter) leaves the row without one: nothing is said or
  -- taken for that figure any more.
  token_id int references tokens(id) on delete set null,
  -- The order the figures were collected in: those with a Remind step today first.
  ord int not null check (ord >= 0),
  -- The figure's number in the message as it was sent; null until then, and for a figure that was left out.
  position int check (position between 1 and 50),
  answer_source text not null,
  -- Whether a reply by this way records the figure's value.
  reply_here boolean not null,
  -- "Still missing" rather than "New".
  still_missing boolean not null default false,
  due_date date,
  unique (delivery_id, prompt_id),
  unique (delivery_id, position)
);
create index on delivery_prompts (prompt_id);
create index on delivery_prompts (workspace_id);
create index on delivery_prompts (metric_id);
alter table delivery_prompts enable row level security;
revoke all on table delivery_prompts from public, anon, authenticated;

select attach_demo_guard('delivery_prompts');
insert into demo_closed_tables (table_name, reason) values
  ('delivery_prompts', 'Closed on purpose: the demo asks for each figure in a message of its own.')
on conflict (table_name) do nothing;
