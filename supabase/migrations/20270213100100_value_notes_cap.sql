-- Value Notes (spec 0064, #1308): the cap of a period counts what the core counts. A note waiting with a proposed
-- Correction is no Value Note yet, so it takes none of the 50 places.
create or replace function value_notes_cap() returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind = 'removed' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('value_notes:' || new.metric_id || ':' || new.period_start, 0));
  if (select count(*) from value_notes v where v.metric_id = new.metric_id and v.period_start = new.period_start and v.kind <> 'removed' and v.proposal is null) >= 50 then
    raise exception using errcode = 'ZF480', message = 'A period keeps at most 50 notes';
  end if;
  return new;
end $$;
