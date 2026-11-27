-- First Steps (spec 0067, ticket 1; GLOSSARY: First Steps, Metric Catalog). Add-only: three columns on tables that
-- exist, and ten entries of the Metric Catalog's Personal category for a clean slate's suggestions. No new table, so
-- row level security and the demo guard of both tables stay as they are, and no demo row is touched.

-- Whether a team or one person uses the Workspace ("My team or business" or "Just me"); null for a Workspace made
-- without First Steps.
alter table workspaces add column used_by text check (used_by in ('team', 'me'));

-- first_steps_at is set only by First Steps: it marks the Workspaces it made. providers_chosen_at is set once it was
-- chosen who sends the values.
alter table setup_guides add column first_steps_at timestamptz;
alter table setup_guides add column providers_chosen_at timestamptz;

-- A name that is in the shared catalog already keeps its row.
insert into catalog_metrics (category,name,description,unit,format,decimals,period,submission_rule,polarity,aggregation,target_min,target_max,sources,industries,segments)
select * from (values
  ('Personal','Hours of sleep','Hours slept in the night before.','h','number',1,'day','overwrite','higher','average',null::numeric,null::numeric,'{web_form,mail}'::text[],null::text[],null::text[]),
  ('Personal','Money saved','Amount put aside during the month.','€','currency',0,'month','overwrite','higher','sum',null,null,'{web_form,mail}',null,null),
  ('Personal','Spending','Amount spent during the week.','€','currency',0,'week','overwrite','lower','sum',null,null,'{web_form,mail}',null,null),
  ('Personal','Account balance','Money in the account at the end of the week.','€','currency',0,'week','overwrite','higher','last',null,null,'{web_form,mail}',null,null),
  ('Personal','Cups of coffee','Cups of coffee drunk in the day.','cups','number',0,'day','overwrite','lower','sum',null,null,'{web_form,mail}',null,null),
  ('Personal','Pages read','Pages read in the day.','pages','number',0,'day','overwrite','higher','sum',null,null,'{web_form,mail}',null,null),
  ('Personal','Screen time','Hours spent looking at a phone in the day.','h','number',1,'day','overwrite','lower','average',null,null,'{web_form,mail}',null,null),
  ('Personal','Club members','People who are members at the end of the month.','members','number',0,'month','overwrite','higher','last',null,null,'{web_form,mail}',null,null),
  ('Personal','Training attendance','People who came to training in the week.','people','number',0,'week','overwrite','higher','average',null,null,'{web_form,mail}',null,null),
  ('Personal','Fees received','Membership fees received during the month.','€','currency',0,'month','overwrite','higher','sum',null,null,'{web_form,mail}',null,null)
) as entry (category,name,description,unit,format,decimals,period,submission_rule,polarity,aggregation,target_min,target_max,sources,industries,segments)
where not exists (select 1 from catalog_metrics c where c.workspace_id is null and c.name = entry.name);
