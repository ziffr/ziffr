-- PROTOTYPE, wipe me. Team Widget Templates (GLOSSARY: Widget Template, Slot, Placeholder).
-- A widget or story saved with its metrics left open as slots. Everyone sees them; only the creator edits.
create table team_templates (
  id bigserial primary key,
  owner_id text not null references profiles(id),
  name text not null,
  description text not null default '',
  view text not null,
  slots jsonb not null default '[]',
  body jsonb not null default '{}',
  w int not null default 6,
  h int not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table team_templates enable row level security;

alter table versions drop constraint versions_object_type_check;
alter table versions add constraint versions_object_type_check
  check (object_type in ('widget','dashboard','deck','master','metric','template'));

-- One template to start from: a year-on-year story with one slot, words that fill themselves in.
create or replace function prototype_seed_templates() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from versions where object_type = 'template';
  truncate team_templates restart identity;
  insert into team_templates (owner_id, name, description, view, slots, body, w, h) values (
    'sara', 'Year-on-year story', 'One metric against the year before, last six periods, latest projection highlighted.', 'story',
    '[{"label":"Metric","multiple":false,"example":"Revenue"}]',
    '{"metricSlots":[0],"settings":{"kicker":"{metric}, {period}","headline":"{metric} {change yoy} on last year","subline":"Change against the same period a year earlier, in %","source":"Source: {metric} in Ziffr","panels":[{"type":"period-bars","slot":0,"metricIds":[],"measure":"pct-yoy","periods":6,"highlight":"projection","projections":true,"annotations":[{"kind":"ring","anchor":{"type":"rule","rule":"max"}}]}]}}',
    8, 10);
end $$;
revoke execute on function prototype_seed_templates() from public, anon, authenticated;
grant execute on function prototype_seed_templates() to service_role;
