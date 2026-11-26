-- The demo's Metrics say how they are calculated (spec 0060, ticket #1200; GLOSSARY: Calculation Note, Demo Mode, Demo
-- Reset): one to three plain sentences for each Metric of the made-up company, so a visitor sees what the field is for.
--
-- A seed function of its own, as the other parts of the demo's seed are (it redefines nothing another migration also
-- redefines): the Demo Reset calls it after the history is seeded and before the showcase, `supabase/seed.sql` and
-- Docker's first start call it too, and it runs once here for a demo that already exists. It writes rows of the demo only,
-- with `ziffr.demo_seed` on for its own transaction (the demo guard refuses a write without it; rule 5), and changes
-- nothing when called again.
create or replace function prototype_seed_calculation_notes() returns void language plpgsql security definer set search_path = public as $$
declare
  demo constant uuid := 'd3e00000-0000-4000-8000-000000000001';
begin
  perform set_config('ziffr.demo_seed', 'on', true);
  update metrics m set calculation_note = v.note
    from (values
      ('revenue', 'Shop orders by the day they were placed, after discounts and refunds. VAT and shipping fees are left out.'),
      ('orders', 'Orders handed to the carrier in the month, each counted once, however many parcels it needed. Cancelled orders are not counted.'),
      ('cost', 'Everything booked as a cost in the month: goods, shipping, staff and marketing. VAT and investments such as new equipment are left out.'),
      ('support-tickets', 'Every ticket a customer opened in the month, by email or the contact form. A reopened ticket is not counted again, and spam is deleted first.'),
      ('return-rate', 'Orders with at least one item sent back, divided by the orders shipped in the same month. An exchange counts as a return.'),
      ('deals-closed', 'Counted on the day a retail partner signs. A renewal of an existing contract is not a new deal.'),
      ('margin', 'Revenue less all operating costs of the month, as a share of revenue. Both come from the Metrics in the formula, so what they leave out is left out here too.'),
      ('average-order-value', 'Revenue of the month divided by the orders shipped in it. VAT and shipping fees are not in it, because they are not in the revenue.'),
      ('gross-margin', 'Revenue less the cost of the goods sold and of shipping them, as a share of revenue. Staff, rent and marketing are not deducted.'),
      ('churn-rate', 'Subscribers who cancelled in the month, divided by the subscribers at its start. A paused subscription does not count as cancelled.'),
      ('support-tickets-weekly', 'Every ticket a customer opened from Monday to Sunday, by email or the contact form. A reopened ticket is not counted again.'),
      ('refunds-weekly', 'Money paid back to customers from Monday to Sunday, counted on the day it was paid out. Vouchers given instead of money are not counted.'),
      ('new-leads-weekly', 'Businesses that asked for a wholesale offer for the first time, from Monday to Sunday. A second request from the same business is not counted.'),
      ('cancellations-weekly', 'Subscriptions cancelled from Monday to Sunday, counted on the day of the cancellation, not the day the subscription runs out.'),
      ('trial-signups-weekly', 'Trials started from Monday to Sunday, one per email address. Test accounts of the team are left out.'),
      ('orders-shipped-weekly', 'Orders handed to the carrier from Monday to Sunday, each counted once. Replacement parcels are not counted.'),
      ('marketing-spend', 'What ad platforms and campaign suppliers billed for the month, excluding VAT. Salaries of the marketing team are not included.'),
      ('new-customers', 'Customers whose first order was placed in the month. Someone who ordered before under the same email address is not new.')
    ) as v(slug, note)
   where m.workspace_id = demo and m.slug = v.slug and m.calculation_note is distinct from v.note;
  perform set_config('ziffr.demo_seed', 'off', true);
end $$;
revoke execute on function prototype_seed_calculation_notes() from public, anon, authenticated;
grant execute on function prototype_seed_calculation_notes() to service_role;

select prototype_seed_calculation_notes();
