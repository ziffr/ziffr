-- The demo's Theme logo, written before 20261231100000_demo_theme_logo.sql runs (ticket #542 follow-up).
-- That migration updates the demo Workspace's default Theme without turning on demo seeding, so on any database that
-- already holds the demo (every running installation; CI seeds the demo only after the migrations, so it passed there)
-- the demo guard refuses it (demo_read_only, ZF4D0) and the app does not start. Migrations are add-only, so this one
-- runs just before it, writes the same logo with seeding on for this transaction only, and leaves the later statement
-- nothing to update (it only touches a Coral Theme without a logo). On a fresh database there is no demo yet, so both
-- statements update nothing and the demo seed writes the logo as before.
select set_config('ziffr.demo_seed', 'on', true);

update themes set slides = slides || '{"logo":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABQklEQVR42u3cwQ3DIBBFQbeUAlJ5iktqMOD8hR2kPVt6I3FafF2Lzuf9+naaK3m6xS6BInAQQ9AQgohBCOGCCIIFEYQKI4gUBBAoiCBMGEEUAH0BBAkjiAEAgAHQE0CIMIIIAAAYAABME4CZ849vAwAAAMBDgQAA2B9gJhIAAGcAjIYCAOAcgJFYAADsAXAHCgAAAAAeirAaAQCAvQBWIwAAsB/ASgQAAPYEWIUAAMC+ACsQAADoATBzjQFYcI8DAHAuwAwCAABnAIwiAABwDsAIAgAAZwHcRQAA4DyA9LIXAAAA2gOkt64BAKixHggAQG+A9CtMAABqrAcCANAbYAYBAAADAIABAMAA6ADg/9Hh+AAAABADQG8ACOH4AAAAgBCOD6FAfAAFACCE40MoEB9CgfggCoSHUCQ+jALRoTwT+wcITdS6TLg8PwAAAABJRU5ErkJggg==","logo_ratio":1,"logo_width":64}'
where workspace_id = 'd3e00000-0000-4000-8000-000000000001' and name = 'Coral' and is_default and slides->>'logo' is null;

select set_config('ziffr.demo_seed', 'off', true);
