-- Story templates (GLOSSARY: Story Widget) are valid widget templates.
alter table widgets drop constraint widgets_template_check;
alter table widgets add constraint widgets_template_check
  check (template in ('number','line','bars','gauge','table','forecast','correlation','matrix','drivers','ranked','share','pictogram','story-line'));
