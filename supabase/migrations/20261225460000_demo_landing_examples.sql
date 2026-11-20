-- The demo shows what the landing page promises (ticket #419; GLOSSARY: Demo Mode, Period Timeline, Period Record,
-- Thread, Workflow, Correction, Lock). Three examples must work as shown, in the app and through MCP:
--   * Gross margin, October 2026: 38.2 % against a target of 40 %, 2.1 points below September, sent by Mia on 3 Nov, with
--     her Thread message about shipping costs;
--   * the Workflow "Weekly numbers", week 47 of 2026: asked Monday 08:00, 5 of 6 in at 14:10, a reminder and an Unusual
--     Value approved by Mia on Tuesday, locked on Wednesday 10:00 with its Snapshot;
--   * Churn rate, March 2026: 3.4 % by mail from Lena, corrected to 3.1 % and accepted by Tom, locked on 7 April, with
--     a Thread of two replies.
-- Their periods and times are fixed dates, not relative to today, so they read the same on every nightly reset. The older
-- seed's events at midnight and its locks stamped with today get a time of day, too. Only the demo Workspace and the
-- made-up demo people are touched, on each demo reset.

-- The Audit Log keeps the time it was written, except when the demo's seed writes its own history.
create or replace function audit_events_stamp() returns trigger language plpgsql set search_path = public as $$
begin
  if new.workspace_id = 'd3e00000-0000-4000-8000-000000000001' and demo_seeding() then return new; end if;
  new.at := now();
  return new;
end;
$$;

-- The demo's people: the three of before, and four more who send and approve numbers.
create or replace function public.prototype_seed_memberships() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from memberships where workspace_id = 'd3e00000-0000-4000-8000-000000000001';
  insert into profiles (id, name, role, color, slack_handle, email) values
    ('mia','Mia Hartmann','Finance lead','#db2777','@mia','mia@northwind.example'),
    ('lena','Lena Petrov','Customer success','#059669','@lena','lena@northwind.example'),
    ('tom','Tom Eriksen','Head of customer success','#2563eb','@tom','tom@northwind.example'),
    ('jonas','Jonas Brandt','Support lead','#ca8a04','@jonas','jonas@northwind.example')
  on conflict (id) do update set name = excluded.name, role = excluded.role, color = excluded.color,
    slack_handle = excluded.slack_handle, email = excluded.email, auth_user_id = null;
  delete from away where user_id in ('mia','lena','tom','jonas');
  insert into memberships (workspace_id, user_id, role) values
    ('d3e00000-0000-4000-8000-000000000001', 'sara', 'owner'),
    ('d3e00000-0000-4000-8000-000000000001', 'ben', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'anna', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'mia', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'lena', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'tom', 'member'),
    ('d3e00000-0000-4000-8000-000000000001', 'jonas', 'member');
end $$;
revoke execute on function prototype_seed_memberships() from public, anon, authenticated;
grant execute on function prototype_seed_memberships() to service_role;

-- The older seed wrote its events at midnight, and stamped the locks of last month with the moment of the reset. Each
-- gets a working-day time of day, in the order it happened, and never one that has not come yet.
create or replace function public.prototype_seed_realistic_times()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  update observations set created_at = least(created_at + make_interval(hours => 8 + (id % 9)::int, mins => ((id * 7) % 60)::int), greatest(created_at, now() - interval '10 minutes'))
    where workspace_id = demo and created_at = date_trunc('day', created_at);
  update actions set created_at = least(created_at + interval '10 hours 5 minutes', greatest(created_at, now() - interval '10 minutes')),
    updated_at = least(updated_at + interval '15 hours 20 minutes', greatest(updated_at, now() - interval '10 minutes'))
    where workspace_id = demo and created_at = date_trunc('day', created_at);
  update thread_messages set created_at = least(created_at + make_interval(hours => 13 + (id % 3)::int, mins => ((id * 11) % 60)::int), greatest(created_at, now() - interval '10 minutes'))
    where workspace_id = demo and created_at = date_trunc('day', created_at);
  -- A period the Workflow published or locked did so the day after its last value came in, in the afternoon.
  update period_states s set updated_at = least(
      date_trunc('day', (select max(o.created_at) from observations o where o.metric_id = s.metric_id and o.period_start = s.period_start))
        + interval '1 day' + make_interval(hours => 15 + (s.metric_id % 3)::int, mins => ((s.metric_id * 13) % 60)::int),
      now() - interval '5 minutes')
    where s.workspace_id = demo and s.state in ('published', 'locked')
      and exists (select 1 from observations o where o.metric_id = s.metric_id and o.period_start = s.period_start);
end $function$;
revoke execute on function prototype_seed_realistic_times() from public, anon, authenticated;
grant execute on function prototype_seed_realistic_times() to service_role;

-- Cost three months ago (20261225430000), now with the times of a working day.
create or replace function public.prototype_seed_period_record()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  p date := (date_trunc('month', current_date) - interval '3 months')::date;
  m int; o record; fixed numeric; act int; at_accepted timestamptz;
begin
  select id into m from metrics where workspace_id = demo and slug = 'cost';
  select id, value into o from observations where metric_id = m and period_start = p order by created_at desc, id desc limit 1;
  if m is null or o.id is null then return; end if;
  fixed := round(o.value * 0.94);
  -- Submitted by mail the day after the month ended; asked about two days later; corrected the day after; locked a day later.
  update observations set original_value = o.value, value = fixed, created_at = p + interval '1 month 1 day 10 hours 12 minutes'
    where id = o.id;
  insert into actions (metric_id, period_start, observation_id, asker_id, assignee_id, question, kind, status, workspace_id, created_at, updated_at)
  values (m, p, o.id, 'sara', 'ben', 'Cost for ' || to_char(p, 'FMMonth YYYY') || ' looks high. Did something land twice?', 'question', 'answered', demo,
    p + interval '1 month 2 days 9 hours 40 minutes', p + interval '1 month 3 days 8 hours 50 minutes')
  returning id into act;
  at_accepted := p + interval '1 month 3 days 8 hours 52 minutes';
  insert into thread_messages (action_id, author_id, body, correction_value, correction_status, workspace_id, created_at) values
    (act, 'ben', 'Yes, one supplier invoice was booked twice. The right figure is ' || to_char(fixed, 'FM999,999,999') || ' €.', fixed, 'accepted', demo, p + interval '1 month 2 days 11 hours 5 minutes'),
    (act, 'sara', 'Thank you, accepted.', null, null, demo, p + interval '1 month 3 days 8 hours 50 minutes');
  insert into audit_events (id, workspace_id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details)
  values (nextval('audit_events_id_seq'), demo, at_accepted, 'sara', 'Sara Lindqvist', 'correction.accepted', 'metric', m::text, 'Cost',
    jsonb_build_object('period', p::text, 'proposed_by', 'ben', 'action_id', act));
  update period_states set updated_at = p + interval '1 month 4 days 15 hours 20 minutes' where metric_id = m and period_start = p;
end $function$;
revoke execute on function prototype_seed_period_record() from public, anon, authenticated;
grant execute on function prototype_seed_period_record() to service_role;

-- Example 1: Gross margin. Monthly values from November 2025 to October 2026, all sent by Mia in the first days of the
-- next month; October is 2.1 points below September and below its target of 40 %, and has a Thread on it.
create or replace function public.prototype_seed_gross_margin()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  vals numeric[] := array[41.0, 40.6, 40.9, 41.3, 40.7, 40.2, 40.8, 41.1, 40.5, 40.9, 40.3, 38.2];
  m int; i int; p date; at timestamptz; oct bigint;
begin
  insert into metrics (workspace_id, slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, sources, owner_id, aggregation)
  values (demo, 'gross-margin', 'Gross margin', 'Share of revenue left after the cost of goods and shipping.', '%', 'percent', 1, 'month', 'overwrite', 'higher', 40, '{web_form}', 'sara', 'none')
  returning id into m;
  insert into tokens (code, metric_id, submitter_id, workspace_id) values ('tk-mia-gross-margin', m, 'mia', demo);
  for i in 0..11 loop
    p := (date '2025-11-01' + make_interval(months => i))::date;
    at := p + interval '1 month' + make_interval(days => 2 + (i % 3), hours => 9, mins => 10 + i * 7);
    -- October is the one the example is about: sent on 3 November.
    if p = date '2026-10-01' then at := timestamptz '2026-11-03 10:15:00+00'; end if;
    insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at)
    values (demo, m, p, vals[i + 1], 'mia', 'web_form', at) returning id into oct;
  end loop;
  insert into actions (workspace_id, metric_id, period_start, observation_id, asker_id, assignee_id, question, kind, status, created_at, updated_at)
  values (demo, m, date '2026-10-01', oct, 'sara', 'mia', 'Gross margin for October 2026 is below its target. What changed?', 'question', 'answered',
    timestamptz '2026-11-03 15:05:00+00', timestamptz '2026-11-03 16:30:00+00')
  returning id into i;
  insert into thread_messages (workspace_id, action_id, author_id, body, created_at)
  values (demo, i, 'mia', 'Shipping costs went up after we changed carriers.', timestamptz '2026-11-03 16:30:00+00');
end $function$;
revoke execute on function prototype_seed_gross_margin() from public, anon, authenticated;
grant execute on function prototype_seed_gross_margin() to service_role;

-- Example 3: Churn rate. March 2026 was sent by Lena by mail as 3.4 %, questioned by Tom, corrected to 3.1 % (the two
-- pilot customers were never billed), accepted by Tom and locked on 7 April. The Thread has Lena's Correction and two replies.
create or replace function public.prototype_seed_churn_rate()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  vals numeric[] := array[2.9, 3.0, 3.3, 3.2, 2.8, 3.1, 2.9, 2.7, 2.8, 3.0, 2.6, 2.8, 2.7];
  m int; i int; p date; at timestamptz; march bigint; act int;
begin
  insert into metrics (workspace_id, slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_max, sources, owner_id, aggregation)
  values (demo, 'churn-rate', 'Churn rate', 'Share of subscribers who cancelled during the month.', '%', 'percent', 1, 'month', 'overwrite', 'lower', 3, '{mail}', 'tom', 'none')
  returning id into m;
  insert into tokens (code, metric_id, submitter_id, workspace_id) values ('tk-lena-churn-rate', m, 'lena', demo);
  -- Tom owns it; the rest of the team reads it.
  insert into shares (workspace_id, object_type, object_id, user_id, role)
  select demo, 'metric', m, u, 'viewer' from unnest(array['sara','ben','anna','mia','jonas']) u;
  for i in 0..12 loop
    p := (date '2025-10-01' + make_interval(months => i))::date;
    at := p + interval '1 month' + make_interval(days => 1 + (i % 2), hours => 10, mins => 5 + i * 9);
    if p = date '2026-03-01' then
      at := timestamptz '2026-04-02 10:32:00+00';
      insert into observations (workspace_id, metric_id, period_start, value, original_value, submitter_id, source, created_at)
      values (demo, m, p, 3.1, 3.4, 'lena', 'mail', at) returning id into march;
    else
      insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at)
      values (demo, m, p, vals[i + 1], 'lena', 'mail', at);
    end if;
  end loop;
  insert into actions (workspace_id, metric_id, period_start, observation_id, asker_id, assignee_id, question, kind, status, created_at, updated_at)
  values (demo, m, date '2026-03-01', march, 'tom', 'lena', 'Churn rate for March 2026 is 3.4 %, above its target of 3 %. Is that right?', 'question', 'closed',
    timestamptz '2026-04-02 14:05:00+00', timestamptz '2026-04-03 10:10:00+00')
  returning id into act;
  insert into thread_messages (workspace_id, action_id, author_id, body, correction_value, correction_status, created_at) values
    (demo, act, 'lena', 'Leaves out the two pilot customers. They were never billed.', 3.1, 'accepted', timestamptz '2026-04-03 09:12:00+00'),
    (demo, act, 'tom', 'That makes sense. I accepted the Correction.', null, null, timestamptz '2026-04-03 10:05:00+00'),
    (demo, act, 'lena', 'Thanks. I will leave pilots out from now on.', null, null, timestamptz '2026-04-03 10:10:00+00');
  insert into audit_events (id, workspace_id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details)
  values (nextval('audit_events_id_seq'), demo, timestamptz '2026-04-03 10:04:00+00', 'tom', 'Tom Eriksen', 'correction.accepted', 'metric', m::text, 'Churn rate',
    jsonb_build_object('period', '2026-03-01', 'proposed_by', 'lena', 'action_id', act));
  -- Locked by a Workflow's last step, so no person is named for it.
  insert into period_states (workspace_id, metric_id, period_start, state, updated_at)
  values (demo, m, date '2026-03-01', 'locked', timestamptz '2026-04-07 09:00:00+00');
end $function$;
revoke execute on function prototype_seed_churn_rate() from public, anon, authenticated;
grant execute on function prototype_seed_churn_rate() to service_role;

-- Example 2: the Workflow "Weekly numbers" with six weekly Metrics, six people, and week 47 of 2026 (Monday 16 to Sunday
-- 22 November) as a story: asked on Monday morning by email, Slack and Telegram, five values in by the afternoon, a
-- reminder to Jonas on Tuesday, his Support tickets up 48 % (an Unusual Value) approved by Mia with a note, everything
-- locked on Wednesday at 10:00, when the dashboard's Snapshot was ready (made by the core, demo-snapshots.ts). The
-- twelve weeks before it are published and locked in the same way.
create or replace function public.prototype_seed_weekly_numbers()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  wk constant date := date '2026-11-16';
  wf int; m int; r record; i int; act int; pr int; dash int; x int := 0;
  value_at timestamptz; ask_at timestamptz; metric_ids int[] := '{}';
begin
  insert into workflows (workspace_id, owner_id, name, config) values (demo, 'sara', 'Weekly numbers',
    '{"dueWorkingDays":2,"steps":[{"type":"remind","daysBefore":1},{"type":"check","changePct":30,"outsideTarget":false},{"type":"approve","approvers":["mia"]},{"type":"publish","lock":true}]}')
  returning id into wf;
  for r in select * from (values
    ('support-tickets-weekly', 'Support tickets', 'Customer support tickets opened in the week.', '', 'number', 'lower', null::numeric, 250::numeric, 'sara', 'jonas', 'email', 'mail', '08:00:00', 'Tue 11:22', 311::numeric, array[188,196,205,199,214,203,196,208,201,212,205,210]::numeric[]),
    ('refunds-weekly', 'Refunds', 'Refunds paid out in the week.', '€', 'currency', 'lower', null, 2500, 'sara', 'mia', 'email', 'web_form', '08:00:10', 'Mon 14:35', 1840, array[2100,1950,2240,2010,1890,2300,2050,1980,2120,1900,2020,1960]),
    ('new-leads-weekly', 'New leads', 'Wholesale leads who asked for an offer.', '', 'number', 'higher', 25, null, 'sara', 'anna', 'slack', 'slack', '08:01:00', 'Mon 14:10', 34, array[27,31,29,33,30,28,35,32,29,31,33,30]),
    ('cancellations-weekly', 'Cancellations', 'Subscriptions cancelled in the week.', '', 'number', 'lower', null, 40, 'sara', 'lena', 'slack', 'slack', '08:01:10', 'Mon 14:51', 31, array[36,33,38,35,32,37,34,31,35,33,30,32]),
    ('trial-signups-weekly', 'Trial sign-ups', 'New trial sign-ups in the week.', '', 'number', 'higher', 120, null, 'sara', 'tom', 'telegram', 'telegram', '08:02:00', 'Mon 15:12', 148, array[118,126,131,124,135,129,122,138,133,141,136,144]),
    ('orders-shipped-weekly', 'Orders shipped', 'Orders shipped in the week.', '', 'number', 'higher', 350, null, 'sara', 'ben', 'email', 'mail', '08:02:10', 'Mon 14:22', 412, array[361,378,372,390,384,369,395,388,376,401,396,405])
  ) as t(slug, name, descr, unit, fmt, pol, tmin, tmax, owner, submitter, channel, src, asked, answered, v47, series) loop
    insert into metrics (workspace_id, slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, owner_id, aggregation, workflow_id)
    values (demo, r.slug, r.name, r.descr, r.unit, r.fmt, 0, 'week', 'overwrite', r.pol, r.tmin, r.tmax, array[r.src], r.owner, 'sum', wf)
    returning id into m;
    metric_ids := metric_ids || m;
    insert into tokens (code, metric_id, submitter_id, workspace_id) values ('tk-' || r.submitter || '-' || r.slug, m, r.submitter, demo);

    -- Weeks 35 to 46: in on the Monday after, locked on the Wednesday.
    for i in 0..11 loop
      insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at)
      values (demo, m, wk - make_interval(weeks => 12 - i), r.series[i + 1], r.submitter, r.src,
        wk - make_interval(weeks => 12 - i) + interval '7 days' + make_interval(hours => 9 + (x % 5), mins => 10 + i * 3));
      insert into period_states (workspace_id, metric_id, period_start, state, updated_at)
      values (demo, m, wk - make_interval(weeks => 12 - i), 'locked', wk - make_interval(weeks => 12 - i) + interval '9 days 10 hours');
    end loop;

    -- Week 47: asked on Monday morning ...
    ask_at := wk + r.asked::time;
    insert into prompts (workspace_id, metric_id, submitter_id, source, text, period_start, sent_at, answered_at)
    values (demo, m, r.submitter, r.src, 'How many ' || lower(r.name) || ' in week 47?', wk, ask_at, null) returning id into pr;
    insert into deliveries (workspace_id, connector, recipient_id, sender_id, kind, prompt_id, subject, body, status, created_at, mail_state, sent_at)
    values (demo, r.channel, r.submitter, 'sara', 'prompt', pr, 'Weekly numbers: ' || r.name, 'What is ' || r.name || ' for week 47?', 'answered', ask_at, 'outbox', null);
    value_at := (wk + substr(r.answered, 5)::time) + (case when left(r.answered, 3) = 'Tue' then interval '1 day' else interval '0' end);
    update prompts set answered_at = value_at where id = pr;
    -- ... a reminder to Jonas on Tuesday morning ...
    if r.submitter = 'jonas' then
      insert into prompts (workspace_id, metric_id, submitter_id, source, text, period_start, sent_at, answered_at)
      values (demo, m, r.submitter, r.src, 'Reminder: how many support tickets in week 47?', wk, wk + interval '1 day 9 hours', value_at) returning id into pr;
      insert into deliveries (workspace_id, connector, recipient_id, sender_id, kind, prompt_id, subject, body, status, created_at, mail_state, sent_at)
      values (demo, r.channel, r.submitter, 'sara', 'reminder', pr, 'Reminder: Weekly numbers: ' || r.name, 'Still missing: ' || r.name || ' for week 47.', 'answered', wk + interval '1 day 9 hours', 'outbox', null);
    end if;
    -- ... then the value.
    insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at)
    values (demo, m, wk, r.v47, r.submitter, r.src, value_at);
    -- Locked on Wednesday at 10:00, one after the other within a minute.
    insert into period_states (workspace_id, metric_id, period_start, state, updated_at)
    values (demo, m, wk, 'locked', wk + interval '2 days 10 hours' + make_interval(secs => x * 5));

    -- Support tickets: 311 against 210, up 48 %: an Unusual Value Mia approved, with a note.
    if r.slug = 'support-tickets-weekly' then
      insert into actions (workspace_id, metric_id, period_start, asker_id, assignee_id, question, kind, purpose, status, created_at, updated_at)
      values (demo, m, wk, 'jonas', 'mia',
        'Approve Support tickets for Week 47, 2026: 311, up 48 % on the period before. Reply “approve”, or “send back:” with what to check.',
        'task', 'approval', 'closed', wk + interval '1 day 11 hours 25 minutes', wk + interval '1 day 11 hours 41 minutes')
      returning id into act;
      insert into thread_messages (workspace_id, action_id, author_id, body, created_at) values
        (demo, act, 'mia', 'The newsletter went out on Monday, so more people wrote in. Fine to publish.', wk + interval '1 day 11 hours 40 minutes'),
        (demo, act, 'mia', 'Approved.', wk + interval '1 day 11 hours 41 minutes');
      insert into audit_events (id, workspace_id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details)
      values (nextval('audit_events_id_seq'), demo, wk + interval '1 day 11 hours 41 minutes', 'mia', 'Mia Hartmann', 'approval.given', 'metric', m::text, r.name,
        jsonb_build_object('period', wk::text, 'action_id', act));
    end if;
    x := x + 1;
  end loop;

  -- The dashboard of the week, its Snapshot is made right after the reset by the core.
  insert into dashboards (workspace_id, name, owner_id) values (demo, 'Weekly numbers', 'sara') returning id into dash;
  for i in 1..array_length(metric_ids, 1) loop
    insert into widgets (workspace_id, owner_id, dashboard_id, template, metric_ids, settings, x, y, w, h)
    values (demo, 'sara', dash, 'number', array[metric_ids[i]], '{}', ((i - 1) % 3) * 4, ((i - 1) / 3) * 4, 4, 4);
  end loop;
end $function$;
revoke execute on function prototype_seed_weekly_numbers() from public, anon, authenticated;
grant execute on function prototype_seed_weekly_numbers() to service_role;

-- demo_reset as in 20261225430000: the times fixed before the period record is made, then the three examples.
create or replace function demo_reset(min_gap interval default interval '1 minute') returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare fresh_catalog boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ziffr-demo-reset'));
  if exists (select 1 from workspaces where id = 'd3e00000-0000-4000-8000-000000000001' and created_at > now() - min_gap) then
    return false;
  end if;
  perform set_config('ziffr.demo_seed', 'on', true);
  fresh_catalog := not exists (select 1 from catalog_metrics);
  perform prototype_reset();
  perform prototype_seed_breakdowns();
  perform prototype_seed_comparisons();
  perform prototype_seed_stories();
  perform prototype_reset_decks();
  perform prototype_seed_templates();
  perform prototype_seed_themes();
  perform prototype_seed_connectors();
  perform prototype_seed_groups();
  perform prototype_seed_workflows();
  perform prototype_seed_realistic_times();
  perform prototype_seed_period_record();
  perform prototype_seed_memberships();
  perform prototype_seed_gross_margin();
  perform prototype_seed_churn_rate();
  perform prototype_seed_weekly_numbers();
  if fresh_catalog then
  update catalog_metrics set aggregation = case
    when name in ('Customer satisfaction','Net Promoter Score','Average delivery time','Body weight') then 'average'
    when name in ('Monthly recurring revenue','Inventory value','Headcount','Cash balance') then 'last'
    when format = 'percent' then 'none' else 'sum' end;
  end if;
  perform set_config('ziffr.demo_seed', 'off', true);
  return true;
end $$;

revoke execute on function demo_reset(interval) from public, anon, authenticated;
grant execute on function demo_reset(interval) to service_role;
