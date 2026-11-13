-- Workspace of dependent rows (ADR 0003, GLOSSARY: Workspace). A row that belongs to another row (an observation
-- to its Metric, a message to its action, a Share to what is shared) always lands in that row's workspace, whatever
-- the writer passed. Writers then only set the workspace on top-level records (Metrics, dashboards, decks, ...),
-- and a value or message can never end up in a workspace other than the one of the thing it belongs to.
create or replace function workspace_from_parent() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ws uuid;
begin
  case tg_table_name
    when 'observations', 'actions', 'prompts', 'period_states', 'series_values', 'tokens', 'analysis_canvas' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'observation_history' then
      select workspace_id into ws from metrics where id = new.metric_id;
    when 'breakdown_rows', 'breakdown_history' then
      select workspace_id into ws from observations where id = new.observation_id;
    when 'thread_messages' then
      select workspace_id into ws from actions where id = new.action_id;
    when 'group_members' then
      select workspace_id into ws from groups where id = new.group_id;
    when 'widgets' then
      if new.dashboard_id is not null then select workspace_id into ws from dashboards where id = new.dashboard_id; end if;
    when 'deliveries' then
      if new.action_id is not null then select workspace_id into ws from actions where id = new.action_id;
      elsif new.prompt_id is not null then select workspace_id into ws from prompts where id = new.prompt_id; end if;
    when 'intake_log' then
      if new.metric_id is not null then select workspace_id into ws from metrics where id = new.metric_id; end if;
    when 'shares', 'versions', 'view_links', 'access_requests' then
      case new.object_type
        when 'metric' then select workspace_id into ws from metrics where id = new.object_id;
        when 'dashboard' then select workspace_id into ws from dashboards where id = new.object_id;
        when 'deck' then select workspace_id into ws from decks where id = new.object_id;
        when 'widget' then select workspace_id into ws from widgets where id = new.object_id;
        when 'template' then select workspace_id into ws from team_templates where id = new.object_id;
        when 'theme' then select workspace_id into ws from themes where id = new.object_id;
        when 'workflow' then select workspace_id into ws from workflows where id = new.object_id;
        else null;
      end case;
    else null;
  end case;
  if ws is not null then new.workspace_id := ws; end if;
  return new;
end $$;

revoke all on function workspace_from_parent() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'observations','actions','prompts','period_states','series_values','tokens','analysis_canvas',
    'observation_history','breakdown_rows','breakdown_history','thread_messages','group_members','widgets',
    'deliveries','intake_log','shares','versions','view_links','access_requests'
  ] loop
    execute format('create trigger workspace_from_parent before insert on %I for each row execute function workspace_from_parent()', t);
  end loop;
end $$;
