-- PROTOTYPE, wipe me. Slide layouts are team templates too: a whole slide with its metrics left open.
alter table team_templates add column kind text not null default 'widget' check (kind in ('widget','slide'));

-- Slots keep the ids of the metrics they were made with, not their names: each viewer sees only names they may see.
create or replace function prototype_seed_templates() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from versions where object_type = 'template';
  truncate team_templates restart identity;
  insert into team_templates (owner_id, kind, name, description, view, slots, body, w, h) values (
    'sara', 'widget', 'Year-on-year story', 'One metric against the year before, last six periods, latest projection highlighted.', 'story',
    '[{"label":"Metric","multiple":false,"exampleIds":[1]}]',
    '{"metricSlots":[0],"settings":{"kicker":"{metric}, {period}","headline":"{metric} {change yoy} on last year","subline":"Change against the same period a year earlier, in %","source":"Source: {metric} in Ziffr","panels":[{"type":"period-bars","slot":0,"metricIds":[],"measure":"pct-yoy","periods":6,"highlight":"projection","projections":true,"annotations":[{"kind":"ring","anchor":{"type":"rule","rule":"max"}}]}]}}',
    8, 10);
end $$;
revoke execute on function prototype_seed_templates() from public, anon, authenticated;
grant execute on function prototype_seed_templates() to service_role;
