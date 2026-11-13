-- PROTOTYPE, wipe me. Breakdowns (GLOSSARY: Breakdown): labelled rows that split one observation.
-- No dimension model: labels are free text, chosen by whoever uploads.
create table breakdown_rows (
  id bigserial primary key,
  observation_id bigint not null references observations(id) on delete cascade,
  label text not null,
  value numeric not null,
  position int not null default 0
);
create index on breakdown_rows (observation_id);
alter table breakdown_rows enable row level security;
-- An Action may point at one row of a breakdown, by label (rows are replaced on re-upload).
alter table actions add column breakdown_label text;

-- Demo: the shop's exports, attached to the totals it already has.
create or replace function prototype_seed_breakdowns() returns void
language plpgsql security definer set search_path = public as $$
declare
  o record; i int; n int; acc numeric; v numeric; share numeric; shares numeric[]; labels text[];
begin
  perform setseed(0.77);
  -- Revenue by country: rows add up to the total.
  labels := array['Germany','Austria','Switzerland','Netherlands','France'];
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'revenue' order by period_start loop
    shares := array[0.50 + (random()-0.5)*0.04, 0.14 + (random()-0.5)*0.02, 0.13 + (random()-0.5)*0.02, 0.12 + (random()-0.5)*0.02];
    acc := 0;
    for i in 1..5 loop
      v := case when i < 5 then round(o.value * shares[i]) else o.value - acc end;
      acc := acc + v;
      insert into breakdown_rows (observation_id, label, value, position) values (o.id, labels[i], v, i);
    end loop;
  end loop;

  -- Orders by payment method: PayPal's share grows from about 55 % to 70 %.
  labels := array['PayPal','Card','Invoice','Direct debit','Other'];
  select count(*) into n from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'orders';
  i := 0;
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'orders' order by period_start loop
    share := 0.55 + 0.15 * i::numeric / greatest(n - 1, 1) + (random()-0.5)*0.02;
    shares := array[share, (1-share)*0.48, (1-share)*0.32, (1-share)*0.13];
    acc := 0;
    for v in 1..5 loop
      insert into breakdown_rows (observation_id, label, value, position)
        values (o.id, labels[v::int], case when v < 5 then round(o.value * shares[v::int]) else o.value - acc end, v::int);
      acc := acc + case when v < 5 then round(o.value * shares[v::int]) else 0 end;
    end loop;
    i := i + 1;
  end loop;

  -- Return rate by product category: rates, so the rows do not add up to the total.
  labels := array['Shoes','Apparel','Accessories','Home'];
  shares := array[1.55, 1.1, 0.6, 0.45];
  for o in select ob.* from observations ob join metrics m on m.id = ob.metric_id where m.slug = 'return-rate' order by period_start loop
    for i in 1..4 loop
      insert into breakdown_rows (observation_id, label, value, position)
        values (o.id, labels[i], round((o.value * shares[i] * (1 + (random()-0.5)*0.12))::numeric, 1), i);
    end loop;
  end loop;
end;
$$;
revoke execute on function prototype_seed_breakdowns() from public, anon, authenticated;
grant execute on function prototype_seed_breakdowns() to service_role;
