---
"@ziffr/web": minor
---

Values are now written in the Workspace's Number Style everywhere, and each Metric's unit can stand before or after the number ("$1,200", "1.200 €"). A new money Metric starts with the unit of the Workspace Profile's currency. Chart labels shorten every unit from 10,000 on ("12.3k", "126k €"), and percentage changes are written one way ("+4.2 %"). Existing Metrics look as before. Developers: API and SDK Metrics carry `unit_position`.
