-- Row ids before the row (spec 0028, ticket #246; GLOSSARY: Workspace Key). A sealed value is bound to its row, so the
-- core needs a new row's id before it writes it: this hands out the next ids of a table's own sequence, which the
-- insert then uses. Only for the tables whose columns the core seals, named here; only the service role may call it.
create function reserve_row_ids(p_table text, p_count integer) returns bigint[] language plpgsql security definer set search_path = public as $$
declare
  seq text;
begin
  if p_table not in ('thread_messages', 'actions') then
    raise exception 'Not a table with sealed columns: %', p_table;
  end if;
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception 'Between 1 and 1000 ids at a time.';
  end if;
  seq := pg_get_serial_sequence(p_table, 'id');
  return array(select nextval(seq) from generate_series(1, p_count));
end;
$$;
revoke all on function reserve_row_ids(text, integer) from public, anon, authenticated;
