-- Value Notes (spec 0064, #1311): the cap of a period also holds when a proposed note starts to count. A note waiting
-- with a proposed Correction takes none of the 50 places; accepting the Correction makes it a Value Note by clearing
-- `proposal`, which is no insert, so the same function now checks that change too, under the same lock. The core then
-- drops the note and keeps the value. Adds only.
create trigger value_notes_cap_accepted before update of proposal on value_notes for each row
  when (old.proposal is not null and new.proposal is null) execute function value_notes_cap();
