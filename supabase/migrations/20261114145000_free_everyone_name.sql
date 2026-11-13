-- Makes room for the built-in Group "Everyone in the workspace" (next migration). A group someone already gave that
-- name keeps its members and shares but is renamed, so the name stays unique per workspace and the built-in group
-- can be added. Its hand-picked members are not turned into the whole workspace.
update groups set name = left(name, 40) || ' (own group)' where name = 'Everyone in the workspace';
