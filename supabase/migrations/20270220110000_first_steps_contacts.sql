-- First Steps (spec 0067, GLOSSARY: First Steps, Contact): the Contacts First Steps added itself. Choosing who provides
-- the numbers again takes back only these, never a Contact the Owner added by hand while the screen stayed open.
alter table setup_guides add column first_steps_contacts text[] not null default '{}';
