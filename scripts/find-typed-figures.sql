-- Which decks, Deck Templates and slide layouts hold numbers typed into their text boxes (GLOSSARY: Deck, Deck
-- Template, Placeholder; ticket #1172). Such words stay as written; a value put in with Insert value fills itself in
-- instead. Slides made from a template or layout before text boxes had live values hold their figures as typed words.
--
-- For whoever runs the Installation. It only reads: the transaction is read-only and nothing is changed. It names each
-- object, its Workspace and owner, and counts the boxes; it prints none of their words. A number may well be meant to
-- be there: ask the owner. It does not look for Metric names, which are sealed with the Workspace Key and cannot be
-- matched in the database, nor at earlier Versions and frozen View Links.
--
--   psql "$DATABASE_URL" -f scripts/find-typed-figures.sql
begin transaction read only;

with boxes as (
  -- The words of every text box of every deck.
  select 'Deck' as kind, d.workspace_id, d.id::bigint as id, d.name, d.owner_id, r.value -> 'props' -> 'richText' as rich
    from decks d
   cross join lateral jsonb_each(case when jsonb_typeof(d.document -> 'store') = 'object' then d.document -> 'store' else '{}'::jsonb end) r
   where r.value ->> 'typeName' = 'shape' and r.value ->> 'type' in ('text', 'geo', 'note', 'arrow')
  union all
  -- And of every shape of the team's Deck Templates and slide layouts.
  select case t.kind when 'deck' then 'Deck Template' else 'Slide layout' end, t.workspace_id, t.id, t.name, t.owner_id, rich
    from team_templates t
   cross join lateral jsonb_path_query(t.body, 'strict $.**.richText') rich
   where t.kind in ('deck', 'slide')
), words as (
  -- Each box's words without its Placeholders, which are filled when drawn.
  select b.kind, b.workspace_id, b.id, b.name, b.owner_id,
         regexp_replace(coalesce((select string_agg(t #>> '{}', ' ') from jsonb_path_query(b.rich, 'strict $.**.text') t), ''), '\{[^{}]*\}', ' ', 'g') as text
    from boxes b
)
select s.name as workspace, f.kind, f.id, f.name, p.name as owner, count(*) as boxes_with_numbers
  from words f
  join workspaces s on s.id = f.workspace_id
  left join profiles p on p.id = f.owner_id
 -- Digits that do not continue a word: "Q3" is a name.
 where f.text ~ '(^|[^[:alnum:]_])[0-9]'
 group by s.name, f.kind, f.id, f.name, p.name
 order by s.name, f.kind, f.name, f.id;

rollback;
