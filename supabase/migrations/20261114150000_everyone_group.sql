-- The built-in Group "Everyone in the workspace" (ADR 0003, GLOSSARY: Group). Every workspace has exactly one, made
-- with the workspace. Its members are not stored: they are the workspace's members except Guests, worked out when
-- shares are read, so whoever joins later gets what was shared with everyone.
alter table groups add column everyone boolean not null default false;
create unique index groups_one_everyone on groups (workspace_id) where everyone;

insert into groups (name, workspace_id, everyone)
  select 'Everyone in the workspace', id, true from workspaces w
  where not exists (select 1 from groups g where g.workspace_id = w.id and g.everyone);

create or replace function make_everyone_group() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into groups (name, workspace_id, everyone) values ('Everyone in the workspace', new.id, true);
  return new;
end $$;
revoke all on function make_everyone_group() from public, anon, authenticated;

create trigger make_everyone_group after insert on workspaces for each row execute function make_everyone_group();
