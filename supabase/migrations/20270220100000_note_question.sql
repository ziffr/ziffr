-- The question "anything behind it?" (spec 0064, ticket 6; GLOSSARY: Value Note, Metric Description). Adds only.

-- The Metric setting **Ask for a note**. Existing Metrics get the default.
alter table metrics add column ask_note text not null default 'always' check (ask_note in ('always', 'off_target_or_unusual', 'never'));

-- The questions asked. A row says which value, or which proposed Correction, an answer is about, and where the answer
-- may come from: replies to one message (delivery_id with the figure's Prompt), or one form that was just sent (a hash
-- of a code only that form's result holds). It holds no words and no number.
create table note_questions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  period_start date not null,
  -- Who was asked, and so whose words the answer is.
  person_id text not null references profiles(id) on delete cascade,
  delivery_id bigint references deliveries(id) on delete cascade,
  prompt_id int references prompts(id) on delete cascade,
  -- The form link's Token a form was sent with; null for a form of someone signed in.
  token_id int references tokens(id) on delete cascade,
  code_hash text unique,
  -- What was asked about: a value that is in, or one proposed for a locked period.
  observation_id bigint,
  proposal bigint references thread_messages(id) on delete cascade,
  -- A hash of the value's row as it was when asked, so that a note on a value replaced since goes to the history.
  value_mark text,
  -- The chat message that asked: Slack's timestamp or Telegram's message id.
  chat_message text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint note_questions_one_place check ((delivery_id is not null and prompt_id is not null and code_hash is null) or (delivery_id is null and prompt_id is null and code_hash is not null)),
  constraint note_questions_one_value check ((observation_id is null) <> (proposal is null))
);
-- One question at most for each figure of a message.
create unique index note_questions_figure on note_questions (delivery_id, prompt_id) where delivery_id is not null;
create index on note_questions (workspace_id);
create index on note_questions (metric_id);
create index on note_questions (chat_message) where chat_message is not null;
alter table note_questions enable row level security;
revoke all on table note_questions from public, anon, authenticated;

select attach_demo_guard('note_questions');
insert into demo_closed_tables (table_name, reason) values
  ('note_questions', 'Closed on purpose: the demo takes no note, so it asks for none.')
on conflict (table_name) do nothing;
