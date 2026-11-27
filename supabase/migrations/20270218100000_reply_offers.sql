-- The open offer after a reply's note (spec 0064, ticket 5; GLOSSARY: Value Note, Correction): a note that held one
-- other number was answered with "to change it to 47, reply yes". The row is what lets that "yes" act, in the same
-- place, as the person's next reply. It holds no words and no number: the words stay in the note, sealed, and the number
-- is read from them again and checked against a keyed mark. One offer at most for a message; the next reply that is
-- read removes it. Adds only.
create table reply_offers (
  delivery_id bigint primary key references deliveries(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  prompt_id int not null references prompts(id) on delete cascade,
  metric_id int not null references metrics(id) on delete cascade,
  note_id bigint not null references value_notes(id) on delete cascade,
  -- A keyed hash of the offered number (the Workspace Key's blind index), and the Number Style it was read in.
  value_mark text not null,
  number_style text not null,
  -- A hash of the period's values and the Submission Rule as they were when the offer was made: any change closes it.
  value_stamp text not null,
  -- The chat message that made the offer, where a reply may answer that message itself (Telegram).
  answer_message_id bigint,
  created_at timestamptz not null default now()
);
create index on reply_offers (workspace_id);
create index on reply_offers (answer_message_id) where answer_message_id is not null;
alter table reply_offers enable row level security;
revoke all on table reply_offers from public, anon, authenticated;

select attach_demo_guard('reply_offers');
insert into demo_closed_tables (table_name, reason) values
  ('reply_offers', 'Closed on purpose: the demo takes no reply that could be offered a change.')
on conflict (table_name) do nothing;

-- A Held Reply keeps up to 5,000 characters now (1,000 before), so that every figure and note of a reply to a Combined
-- Prompt is in what the person confirms. Only widens what the column takes: 5,000 characters, sealed and in base64,
-- stay below this.
alter table held_replies drop constraint held_replies_sealed_text_check;
alter table held_replies add constraint held_replies_sealed_text_check check (char_length(sealed_text) <= 28000);
