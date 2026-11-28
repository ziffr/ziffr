-- Transfer ownership (GLOSSARY: Workspace Role; spec 0071, ticket #1418): an Owner hands their own role to an Admin or
-- a Member, who becomes Owner while the former Owner becomes an Admin. One function, so one transaction: both rows are
-- held and both roles checked in it, and two changes at once never leave a Workspace without an Owner. Promoted first,
-- then demoted, so keep_an_owner (20261114185000) finds the new Owner. Other Owners and what anyone owns stay as they are.
create function transfer_ownership(p_workspace uuid, p_from text, p_to text) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  from_role text;
  to_role text;
begin
  -- Both rows, always in the same order, until the transaction ends: no role changes between the check and the writes.
  perform 1 from memberships where workspace_id = p_workspace and user_id in (p_from, p_to) order by user_id for update;
  select role into from_role from memberships where workspace_id = p_workspace and user_id = p_from;
  if from_role is distinct from 'owner' then
    raise exception 'transfer_not_owner' using errcode = 'P0001';
  end if;
  -- Never a Guest, a Contact, an Owner (so never oneself) or somebody outside the Workspace.
  select role into to_role from memberships where workspace_id = p_workspace and user_id = p_to;
  if to_role is null or to_role not in ('admin', 'member')
     or exists (select 1 from contacts where workspace_id = p_workspace and person_id = p_to) then
    raise exception 'transfer_target' using errcode = 'P0001';
  end if;
  update memberships set role = 'owner' where workspace_id = p_workspace and user_id = p_to;
  update memberships set role = 'admin' where workspace_id = p_workspace and user_id = p_from;
  return to_role;
end $$;
revoke execute on function transfer_ownership(uuid, text, text) from public, anon, authenticated;
grant execute on function transfer_ownership(uuid, text, text) to service_role;
