-- Quarterly and yearly Metrics in the Metric Catalog (spec 0017, ticket #43; GLOSSARY: Metric Catalog, Period): the
-- Metrics that are usually reported once a quarter or a year say so, so a Metric made from them is asked for its
-- value as often as it exists. Matched by name, so a workspace's own Metrics made from them earlier keep theirs.
update catalog_metrics set period = 'quarter', description = 'Promoters minus detractors, from the quarterly NPS survey.'
  where name = 'Net Promoter Score' and period = 'month';
update catalog_metrics set period = 'quarter', description = 'Promoters minus detractors among employees asked each quarter how likely they are to recommend working here.'
  where name = 'Employee Net Promoter Score' and period = 'month';
update catalog_metrics set period = 'quarter', description = 'People on payroll at the end of the quarter.'
  where name = 'Headcount' and period = 'month';

insert into catalog_metrics (category,name,description,unit,format,decimals,period,submission_rule,polarity,aggregation,target_min,target_max,sources,industries,segments) values
  ('Finance','Annual revenue target','The revenue planned for the fiscal year in the budget, excluding VAT.','€','currency',0,'year','overwrite','higher','sum',null,null,'{web_form,mail}',null,null),
  ('Finance','Annual revenue','Net revenue invoiced in the fiscal year, excluding VAT, discounts and credit notes.','€','currency',0,'year','overwrite','higher','sum',null,null,'{web_form,mail}',null,null)
on conflict (name) do nothing;
