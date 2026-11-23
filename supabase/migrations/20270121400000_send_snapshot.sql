-- Send Snapshot and the Finished Period (spec 0045, ticket #793; GLOSSARY: Send Snapshot, Finished Period, Snapshot,
-- Workflow). The once-per-period claim of workflow_step_runs (#791) gains two kinds of row:
--   `send_snapshot`  the step's send for a period, claimed before anything is taken or sent; it keeps the Snapshot's id
--                    and the counts sent and skipped (ids and numbers only, no word of the Snapshot or of a person),
--   `snapshot_note`  a notice the owner got about the step for a period (waiting for a written draft, a Snapshot that
--                    could not be taken), told once.
-- That a period is finished is never stored: it is read from the Locks and the Tasks, so a reopened Task un-finishes it.
alter table workflow_step_runs drop constraint workflow_step_runs_kind_check;
alter table workflow_step_runs add constraint workflow_step_runs_kind_check
  check (kind in ('checklist', 'paused', 'task_step', 'send_snapshot', 'snapshot_note'));
-- The Snapshot a send used. A deleted Snapshot keeps no frozen part; the row only forgets which one it was.
alter table workflow_step_runs add column snapshot_id bigint references dashboard_snapshots(id) on delete set null;
-- The dashboard a message links to, so that it is checked again when it leaves that its recipient may still open it (rule 3).
alter table deliveries add column snapshot_dashboard_id int references dashboards(id) on delete set null;

create or replace function claim_workflow_step(p_workspace uuid, p_workflow int, p_step text, p_period date, p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare run_id bigint;
begin
  if p_kind not in ('checklist', 'paused', 'task_step', 'send_snapshot', 'snapshot_note') then return null; end if;
  if not exists (select 1 from workflows where id = p_workflow and workspace_id = p_workspace) then return null; end if;
  insert into workflow_step_runs (workspace_id, workflow_id, step_id, period_start, kind)
    values (p_workspace, p_workflow, p_step, p_period, p_kind)
    on conflict (workflow_id, step_id, period_start) do nothing
    returning id into run_id;
  return run_id;
end $$;
revoke execute on function claim_workflow_step(uuid, int, text, date, text) from public, anon, authenticated;
grant execute on function claim_workflow_step(uuid, int, text, date, text) to service_role;

-- The demo's finished period (spec 0045, "Demo"): the monthly finance close gains two Checklist Items and a Send
-- Snapshot step for its board dashboard, a finished past period (its Tasks done with a note, the item and the Snapshot
-- recorded as sent) and the current period with one open Task. Nothing is ever sent from the demo; these are the
-- records of what the Workflow would have done. A function of its own, as the pins are (20270119100000), so no other
-- migration has to carry it: the demo's reset calls it after its Snapshots are taken (so the finished period can name
-- one), `supabase/seed.sql` and Docker's first start call it too, and it runs once here for a demo that exists.
create or replace function prototype_seed_close() returns void language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  fin int; board int; snap bigint; task int; bank text := 'demo-bank-reconcile'; cutoff text := 'demo-invoice-cutoff'; send text := 'demo-board-snapshot'; send_claim constant text := 'send-snapshot';
  past date := (date_trunc('month', current_date) - interval '2 months')::date;
  current_p date := (date_trunc('month', current_date) - interval '1 month')::date;
  added date := (date_trunc('month', current_date) - interval '6 months')::date;
begin
  select id into fin from workflows where workspace_id = demo and name = 'Monthly finance close' order by id limit 1;
  if fin is null then return; end if;
  perform set_config('ziffr.demo_seed', 'on', true);
  select id into board from dashboards where workspace_id = demo and name = 'October in short' order by id limit 1;
  if board is null then select id into board from dashboards where workspace_id = demo order by id limit 1; end if;
  delete from workflow_step_runs where workspace_id = demo and workflow_id = fin;
  delete from actions where workspace_id = demo and workflow_id = fin and purpose = 'checklist';
  -- Steps: the existing ones except the Publish step, the new ones, and Publish last (as the editor stores them).
  update workflows set config = jsonb_set(config, '{steps}',
    coalesce((select jsonb_agg(s order by o) from jsonb_array_elements(config->'steps') with ordinality as t(s, o)
              where s->>'type' not in ('checklist', 'send_snapshot', 'publish')), '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object('type', 'checklist', 'id', bank, 'kind', 'tick', 'text', 'Reconcile the bank account', 'assignee', 'ben', 'standIn', 'anna', 'dueWorkingDays', 3, 'addedOn', added),
      jsonb_build_object('type', 'checklist', 'id', cutoff, 'kind', 'info', 'text', 'Invoice cut-off is Friday', 'day', 1, 'people', jsonb_build_array('ben', 'anna'), 'groups', '[]'::jsonb, 'addedOn', added),
      jsonb_build_object('type', 'send_snapshot', 'id', send, 'dashboardId', board, 'people', jsonb_build_array('ben', 'anna'), 'groups', '[]'::jsonb, 'addedOn', added),
      jsonb_build_object('type', 'publish', 'lock', true)))
  where id = fin;
  -- The past period: its Task done with a note, the item sent and the Snapshot sent; its Locks make it a finished one.
  select id into snap from dashboard_snapshots where workspace_id = demo and dashboard_id = board and period_kind = 'month' and period_start = past and deleted_at is null and shown_at is not null;
  insert into actions (workspace_id, workflow_id, checklist_item_id, period_start, asker_id, assignee_id, question, kind, purpose, status, due_date, created_at, updated_at)
  values (demo, fin, bank, past, 'sara', 'ben', 'Reconcile the bank account', 'task', 'checklist', 'closed', (past + interval '1 month' + interval '3 days')::date, past + interval '1 month' + interval '1 hour', past + interval '1 month' + interval '2 days')
  returning id into task;
  insert into thread_messages (workspace_id, action_id, author_id, body, created_at) values (demo, task, 'ben', 'Matched, one open item of 12 €.', past + interval '1 month' + interval '2 days');
  insert into workflow_step_runs (workspace_id, workflow_id, step_id, period_start, kind, ran_at, sent)
  values (demo, fin, cutoff, past, 'checklist', past + interval '1 month' + interval '1 day 9 hours', 2);
  insert into workflow_step_runs (workspace_id, workflow_id, step_id, period_start, kind, ran_at, sent, skipped, snapshot_id)
  values (demo, fin, send_claim, past, 'send_snapshot', past + interval '1 month' + interval '4 days 1 minute', 2, 0, snap);
  -- The current period: its Task is still open.
  insert into actions (workspace_id, workflow_id, checklist_item_id, period_start, asker_id, assignee_id, question, kind, purpose, status, due_date)
  values (demo, fin, bank, current_p, 'sara', 'ben', 'Reconcile the bank account', 'task', 'checklist', 'open', (current_p + interval '1 month' + interval '3 days')::date);
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_close() from public, anon, authenticated;
grant execute on function prototype_seed_close() to service_role;

select prototype_seed_close();
