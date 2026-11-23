-- The demo has three years of history, so every analysis runs on it (ticket #987; GLOSSARY: Demo Mode, Method, Heads-up).
-- Until now the monthly Metrics had 18 months, the weekly ones 13 weeks, and a Method that needs two seasons, a year of
-- pairs or months in common between a weekly and a monthly Metric said "not enough". This adds the years BEFORE the
-- history the seed already makes, and changes none of the values that are there:
--   * Revenue, Orders, Cost, Support tickets, Return rate, Gross margin and Churn rate: 24 months before the seed's
--     first month (30 for the two that started later), so 42 months in all, with the December peak of the seed's
--     own formulas; the return rate rises and falls with the month's support tickets, as in the seed, and churn follows
--     the tickets of two months before;
--   * the six weekly Metrics: 143 weeks before the first one, so 156 weeks (three years), with a yearly pattern in
--     Orders shipped, Support tickets going before Refunds by a week, Trial sign-ups rising and falling with New leads, both stepping up
--     on 1 September 2025 (the autumn campaign), and Cancellations kept apart from it;
--   * the Breakdowns of Revenue (by country), Orders (by payment method) and Return rate (by category) for the new
--     months, and parts under Germany and Austria for every month of Revenue, so a Bridge, a Pareto, a share of the
--     largest rows and the tree of a Breakdown have rows to work on; the budget of Revenue for the new months.
-- Deterministic: the noise is a hash of the Metric and the period (never random()), so every Installation holds the same
-- numbers, as the seed's own setseed did. A function of its own, as the pins and the finished period are (20270119100000):
-- the demo's reset calls it after demo_reset, `supabase/seed.sql` and Docker's first start call it too, and it runs once
-- here for a demo that exists. It does nothing twice, and nothing where the demo has no Revenue. Only the demo Workspace
-- is touched, with `ziffr.demo_seed` on for its own transaction (the demo guard refuses a write without it).

-- A number from 0 up to but not 1 that depends on the text alone: the same on every Installation and every run.
create or replace function prototype_noise(seed text) returns double precision language sql immutable parallel safe as $$
  select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint)::double precision / 4294967296.0
$$;
-- Two of them added, centred: a number from -1 up to 1, likelier near 0.
create or replace function prototype_wobble(seed text) returns double precision language sql immutable parallel safe as $$
  select prototype_noise(seed || 'a') + prototype_noise(seed || 'b') - 1
$$;
-- How busy a week of the year is for the shop: a peak in the weeks before Christmas, a dip in January.
create or replace function prototype_season(week_of_year int) returns double precision language sql immutable parallel safe as $$
  select 1 + 0.22 * exp(-power(least(abs(week_of_year - 49.5), 52 - abs(week_of_year - 49.5)) / 3.0, 2))
           - 0.10 * exp(-power(least(abs(week_of_year - 3.0), 52 - abs(week_of_year - 3.0)) / 2.5, 2))
$$;
revoke execute on function prototype_noise(text), prototype_wobble(text), prototype_season(int) from public, anon, authenticated;
grant execute on function prototype_noise(text), prototype_wobble(text), prototype_season(int) to service_role;

create or replace function prototype_seed_history() returns void language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
  rev int; ord int; cst int; tix int; ret int; gm int; churn int; spend int; newc int; r_spend numeric; r_new numeric;
  p0 date; i int; k int; d date; at timestamptz;
  m record; o bigint; pid bigint; v numeric; acc numeric; shares numeric[]; share numeric;
  -- the monthly values of the new months, index 1 = 25 months before the seed's first month (needed for the lags), up to 25 = the month before it
  r_rev numeric[]; r_ord numeric[]; r_tix numeric[]; r_cst numeric[]; r_ret numeric[];
  weeks constant int := 143;
  f date;
  w_tix numeric[]; w_ref numeric[]; w_lead numeric[]; w_sign numeric[]; w_can numeric[]; w_ord numeric[];
  w_date date[];
  step constant date := date '2025-09-01';
begin
  select id into rev from metrics where workspace_id = demo and slug = 'revenue';
  if rev is null then return; end if;
  -- Once only: a Revenue with a history of two years or more has had it.
  if (select count(*) from observations where metric_id = rev) >= 30 then return; end if;
  perform set_config('ziffr.demo_seed', 'on', true);
  select id into ord from metrics where workspace_id = demo and slug = 'orders';
  select id into cst from metrics where workspace_id = demo and slug = 'cost';
  select id into tix from metrics where workspace_id = demo and slug = 'support-tickets';
  select id into ret from metrics where workspace_id = demo and slug = 'return-rate';
  select id into gm from metrics where workspace_id = demo and slug = 'gross-margin';
  select id into churn from metrics where workspace_id = demo and slug = 'churn-rate';
  select min(period_start) into p0 from observations where metric_id = rev;

  -- ---- Monthly: the same formulas as the seed, for the months before it (i = -24 .. -1 months from its first) ----
  for i in -25..-1 loop
    d := (p0 + make_interval(months => i))::date;
    r_rev[i + 26] := round(92000 * power(1.016, i) * (1 + case extract(month from d) when 11 then 0.18 when 12 then 0.32 when 1 then -0.12 else 0 end) * (1 + prototype_wobble('rev' || i) * 0.04));
    r_ord[i + 26] := round(r_rev[i + 26] / (64 + i * 0.35 + prototype_wobble('ord' || i) * 2));
    r_tix[i + 26] := round(250 + r_ord[i + 26] * 0.06 + prototype_wobble('tix' || i) * 25);
    r_cst[i + 26] := round(r_rev[i + 26] * 0.62 + r_tix[i + 26] * 38 + prototype_wobble('cst' || i) * 1500);
    -- Returns rise and fall with the tickets of the month, as in the seed.
    r_ret[i + 26] := round((4.2 + (r_tix[i + 26] - 330) / 90.0 + prototype_wobble('ret' || i) * 0.3)::numeric, 1);
  end loop;
  for m in select s.id, s.slug, s.submitter_id, s.source, (select state from period_states ps where ps.metric_id = s.id order by period_start limit 1) state
           from (select distinct on (me.id) me.id, me.slug, o2.submitter_id, o2.source from metrics me join observations o2 on o2.metric_id = me.id
                 where me.id in (rev, ord, cst, tix, ret) order by me.id, o2.period_start) s loop
    for i in -24..-1 loop
      d := (p0 + make_interval(months => i))::date;
      v := case m.slug when 'revenue' then r_rev[i + 26] when 'orders' then r_ord[i + 26] when 'cost' then r_cst[i + 26] when 'support-tickets' then r_tix[i + 26] else r_ret[i + 26] end;
      at := d + interval '1 month' + make_interval(days => 1 + (i + 24) % 3, hours => 8 + (i + 24 + m.id::int) % 9, mins => ((i + 24) * 7 + m.id::int * 3) % 60);
      insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at)
      values (demo, m.id, d, v, m.submitter_id, m.source, at);
      if m.state is not null then
        insert into period_states (workspace_id, metric_id, period_start, state, updated_at) values (demo, m.id, d, m.state, at + interval '1 day 15 hours')
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- Gross margin and Churn rate started later (their first month is fixed): they go back to the same first month as Revenue.
  for m in select s.id, s.slug, s.first, s.submitter_id, s.source from (select distinct on (me.id) me.id, me.slug, o2.period_start first, o2.submitter_id, o2.source
           from metrics me join observations o2 on o2.metric_id = me.id where me.id in (gm, churn) order by me.id, o2.period_start) s loop
    for d in select g::date from generate_series((p0 - interval '24 months')::date, (m.first - interval '1 month')::date, interval '1 month') g loop
      i := ((extract(year from d) - extract(year from p0)) * 12 + extract(month from d) - extract(month from p0))::int;
      -- Gross margin slips a little when returns are high; churn follows the tickets of two months before.
      v := case m.slug
        when 'gross-margin' then round((41.6 + prototype_wobble('gm' || d) * 0.5 - 0.5 * (coalesce(r_ret[i + 26], 4.3) - 4.3))::numeric, 1)
        else round((3.0 + 0.012 * (coalesce(r_tix[i + 24], 320) - 330) + prototype_wobble('churn' || d) * 0.15 + case when i < -12 then 0.3 else 0 end)::numeric, 1) end;
      at := d + interval '1 month' + make_interval(days => 1 + (i + 24) % 3, hours => 9 + (i + 24) % 4, mins => 10 + (i + 24) * 9 % 50);
      insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at) values (demo, m.id, d, v, m.submitter_id, m.source, at);
    end loop;
  end loop;

  -- ---- The Breakdowns of the new months, and parts under Germany and Austria for all of them ----
  -- Revenue by country (rows add up to the total), as the seed makes them.
  for o, d, v in select ob.id, ob.period_start, ob.value from observations ob where ob.metric_id = rev and ob.created_at is not null and not exists (select 1 from breakdown_rows b where b.observation_id = ob.id) order by ob.period_start loop
    shares := array[0.50 + prototype_wobble('c1' || d) * 0.02, 0.14 + prototype_wobble('c2' || d) * 0.01, 0.13 + prototype_wobble('c3' || d) * 0.01, 0.12 + prototype_wobble('c4' || d) * 0.01];
    acc := 0;
    for k in 1..5 loop
      insert into breakdown_rows (workspace_id, observation_id, label, value, position)
      values (demo, o, (array['Germany','Austria','Switzerland','Netherlands','France'])[k], case when k < 5 then round(v * shares[k]) else v - acc end, k);
      acc := acc + case when k < 5 then round(v * shares[k]) else 0 end;
    end loop;
  end loop;
  -- Orders by payment method: PayPal's share grows from about 55 % to 70 %.
  for o, d, v in select ob.id, ob.period_start, ob.value from observations ob where ob.metric_id = ord and not exists (select 1 from breakdown_rows b where b.observation_id = ob.id) order by ob.period_start loop
    share := 0.45 + 0.10 * (((extract(year from d) - extract(year from p0)) * 12 + extract(month from d) - extract(month from p0)) + 24) / 24.0 + prototype_wobble('pp' || d) * 0.01;
    shares := array[share, (1 - share) * 0.48, (1 - share) * 0.32, (1 - share) * 0.13];
    acc := 0;
    for k in 1..5 loop
      insert into breakdown_rows (workspace_id, observation_id, label, value, position)
      values (demo, o, (array['PayPal','Card','Invoice','Direct debit','Other'])[k], case when k < 5 then round(v * shares[k]) else v - acc end, k);
      acc := acc + case when k < 5 then round(v * shares[k]) else 0 end;
    end loop;
  end loop;
  -- Return rate by product category: rates, so the rows do not add up to the total.
  for o, d, v in select ob.id, ob.period_start, ob.value from observations ob where ob.metric_id = ret and not exists (select 1 from breakdown_rows b where b.observation_id = ob.id) order by ob.period_start loop
    for k in 1..4 loop
      insert into breakdown_rows (workspace_id, observation_id, label, value, position)
      values (demo, o, (array['Shoes','Apparel','Accessories','Home'])[k], round((v * (array[1.55, 1.1, 0.6, 0.45])[k] * (1 + prototype_wobble('rc' || k || d) * 0.06))::numeric, 1), k);
    end loop;
  end loop;
  -- Parts: Germany is sold in the online shop, to retail partners and wholesale; Austria in the shop and to partners. Every month of Revenue.
  for o in select ob.id from observations ob where ob.metric_id = rev and not exists (select 1 from breakdown_rows b where b.observation_id = ob.id and b.parent_id is not null) loop
    for m in select b.id, b.label, b.value from breakdown_rows b where b.observation_id = o and b.label in ('Germany', 'Austria') order by b.position loop
      if m.label = 'Germany' then
        insert into breakdown_rows (workspace_id, observation_id, label, value, position, parent_id) values
          (demo, o, 'Germany: Online shop', round(m.value * 0.62), 1, m.id),
          (demo, o, 'Germany: Retail partners', round(m.value * 0.26), 2, m.id),
          (demo, o, 'Germany: Wholesale', m.value - round(m.value * 0.62) - round(m.value * 0.26), 3, m.id);
      else
        insert into breakdown_rows (workspace_id, observation_id, label, value, position, parent_id) values
          (demo, o, 'Austria: Online shop', round(m.value * 0.7), 1, m.id),
          (demo, o, 'Austria: Retail partners', m.value - round(m.value * 0.7), 2, m.id);
      end if;
    end loop;
  end loop;
  -- The budget of Revenue for the new months (the seed's formula).
  for i in -24..-1 loop
    d := (p0 + make_interval(months => i))::date;
    insert into series_values (workspace_id, metric_id, kind, period_start, value, note)
    values (demo, rev, 'target', d, round(105000 * power(1.012, i) * case extract(month from d) when 11 then 1.15 when 12 then 1.3 when 1 then 0.88 else 1 end), 'Budget 2025/26')
    on conflict do nothing;
  end loop;

  -- ---- Weekly: 143 weeks before the first one (the first week is 2026-08-24 in the seed, fixed) ----
  select min(period_start) into f from observations o join metrics me on me.id = o.metric_id where me.workspace_id = demo and me.slug = 'support-tickets-weekly';
  if f is not null then
    for k in 1..weeks + 1 loop
      d := (f - make_interval(weeks => k))::date;
      w_date[k] := d;
      -- The shop's yearly pattern and its growth, for Orders shipped.
      w_ord[k] := round(361 * power(1.0035, -k) * prototype_season(extract(week from d)::int) * (1 + prototype_wobble('wo' || k) * 0.025));
      -- Support tickets: about 200 a week, a little busier before Christmas.
      w_tix[k] := round(200 * (1 + 0.4 * (prototype_season(extract(week from d)::int) - 1)) + prototype_wobble('wt' || k) * 50);
      -- New leads: about 21 a week, about 31 after the autumn campaign began on 1 September 2025.
      w_lead[k] := round((case when d >= step then 31 else 21.5 end) + prototype_wobble('wl' || k) * 3);
      w_can[k] := round(36.5 - 0.02 * (weeks - k) + prototype_wobble('wc' || k) * 2);
    end loop;
    -- Refunds follow the tickets of the week before (k + 1 is a week earlier); Trial sign-ups rise and fall with the leads of the week, and a little with the week before.
    for k in 1..weeks loop
      w_ref[k] := round(2000 + 12 * (w_tix[k + 1] - 200) + prototype_wobble('wr' || k) * 60);
      w_sign[k] := round(131 + 3 * (w_lead[k] - 31) + 1.5 * (w_lead[k + 1] - 31) + prototype_wobble('ws' || k) * 4);
    end loop;
    for m in select s.id, s.slug, s.submitter_id, s.source from (select distinct on (me.id) me.id, me.slug, o2.submitter_id, o2.source
             from metrics me join observations o2 on o2.metric_id = me.id where me.workspace_id = demo and me.period = 'week' order by me.id, o2.period_start) s order by s.id loop
      for k in 1..weeks loop
        d := w_date[k];
        v := case m.slug when 'support-tickets-weekly' then w_tix[k] when 'refunds-weekly' then w_ref[k] when 'new-leads-weekly' then w_lead[k]
                         when 'cancellations-weekly' then w_can[k] when 'trial-signups-weekly' then w_sign[k] else w_ord[k] end;
        at := d + interval '7 days' + make_interval(hours => 9 + (k + m.id::int) % 5, mins => 10 + (k * 3) % 40);
        insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at) values (demo, m.id, d, v, m.submitter_id, m.source, at);
        insert into period_states (workspace_id, metric_id, period_start, state, updated_at) values (demo, m.id, d, 'locked', d + interval '9 days 10 hours') on conflict do nothing;
      end loop;
    end loop;
  end if;

  -- ---- Two Metrics of their own, for what Heads-ups and the Target are about (42 months, from the seed's first month back 24) ----
  -- Marketing spend goes up steadily; New customers follow it for three years and then stop: for the last six months they
  -- keep to their line while the spend goes its own way, so the link has stopped, and the Target (450 a month) is out of reach.
  insert into metrics (workspace_id, slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, sources, owner_id, aggregation)
  values (demo, 'marketing-spend', 'Marketing spend', 'Money spent on ads and campaigns in the month.', '€', 'currency', 0, 'month', 'overwrite', 'lower', null, '{web_form}', 'sara', 'sum')
  returning id into spend;
  insert into metrics (workspace_id, slug, name, description, unit, format, decimals, period, submission_rule, polarity, target_min, sources, owner_id, aggregation)
  values (demo, 'new-customers', 'New customers', 'Customers who ordered for the first time in the month.', '', 'number', 0, 'month', 'overwrite', 'higher', 450, '{web_form}', 'sara', 'sum')
  returning id into newc;
  for k in 0..41 loop
    d := (p0 + make_interval(months => k - 24))::date;
    r_spend := round(14000 * power(1.012, k) * (1 + prototype_wobble('sp' || k) * 0.07));
    -- New customers: about 1.6 per 100 euros of the month's spend; the last six months keep to the line they were on and no longer follow the spend's ups and downs.
    r_new := round(case when k < 36 then 0.016 * r_spend + 30 + prototype_wobble('nc' || k) * 5
                        else 0.016 * 14000 * power(1.012, k) + 30 + prototype_wobble('nf' || k) * 4 end);
    at := d + interval '1 month' + make_interval(days => 2 + k % 3, hours => 9 + k % 4, mins => 5 + k * 7 % 50);
    insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at) values (demo, spend, d, r_spend, 'sara', 'web_form', at);
    insert into observations (workspace_id, metric_id, period_start, value, submitter_id, source, created_at) values (demo, newc, d, r_new, 'sara', 'web_form', at);
  end loop;
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_history() from public, anon, authenticated;
grant execute on function prototype_seed_history() to service_role;

select prototype_seed_history();
