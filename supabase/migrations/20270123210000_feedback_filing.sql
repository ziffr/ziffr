-- Feedback bridge out (spec 0049, ticket #917; GLOSSARY: Feedback): where a feedback was filed on GitHub and how the
-- filing went. Add-only: nullable columns on `feedback`, so existing rows (and the demo's) are untouched.
-- The link between a person and a public post lives only here (never in the post); the browser roles still have no grant.
alter table feedback
  add column github_kind text check (github_kind is null or github_kind in ('issue', 'discussion')),
  add column github_number int check (github_number is null or github_number > 0),
  add column github_url text check (github_url is null or char_length(github_url) <= 300),
  add column filed_at timestamptz,
  add column filing_attempts int not null default 0,
  add column filing_attempted_at timestamptz,
  add column filing_error text check (filing_error is null or char_length(filing_error) <= 200),
  add constraint feedback_filed_whole check (
    (github_kind is null) = (github_number is null) and (github_number is null) = (github_url is null) and (github_number is null) = (filed_at is null));
-- One post belongs to one feedback, and (with the update that records it only where github_number is null) one feedback
-- is filed at most once.
create unique index feedback_github_post_idx on feedback (github_kind, github_number) where github_number is not null;
create index feedback_to_file_idx on feedback (created_at) where status = 'open' and github_number is null;

-- Takes up to p_limit feedback that are open, not filed yet, tried fewer than p_max_attempts times and not tried within
-- p_retry_minutes, marks each as tried now (a lease: two workers at once never take the same one) and returns them.
create or replace function feedback_claim_for_filing(p_limit int, p_max_attempts int, p_retry_minutes int)
returns setof feedback
language sql security definer set search_path = public as $$
  update feedback f set filing_attempts = f.filing_attempts + 1, filing_attempted_at = now()
  where f.id in (
    select id from feedback
    where status = 'open' and github_number is null and filing_attempts < p_max_attempts
      and (filing_attempted_at is null or filing_attempted_at < now() - make_interval(mins => p_retry_minutes))
    order by created_at limit least(greatest(p_limit, 0), 50) for update skip locked)
  returning f.*;
$$;
revoke execute on function feedback_claim_for_filing(int, int, int) from public, anon, authenticated;
grant execute on function feedback_claim_for_filing(int, int, int) to service_role;
