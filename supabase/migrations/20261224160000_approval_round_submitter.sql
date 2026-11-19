-- Whose value an Approval round is about (ticket #218; GLOSSARY: Approval, Correction). Nobody approves their own
-- value, and each Approver in order skips the same person: the one who submitted it, or the one whose Correction was
-- accepted. Kept with the round, so the next step does not look it up again from the latest value. Null for rounds
-- started before this column existed, which keep looking it up as before.
alter table period_states add column approval_for text check (char_length(approval_for) <= 64);
