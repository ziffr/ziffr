# Ziffr is source-available under BSL 1.1, with a paid business license for its ee/ folder and MIT for what others build on

Anyone may read, change and contribute to Ziffr, and run it themselves, also commercially inside their own organisation and for clients they serve directly; what nobody but the licensor may do is offer Ziffr to third parties as a hosted or managed service. Each version becomes AGPL-3.0 three years after it is published. Features the licensor sells live in `ee/` under the paid Ziffr Business License. The parts others build on (the connector kit, the template and widget formats, the API and MCP client libraries) are MIT, so connectors, templates and widgets made by others may be free, paid or closed. Contributors sign a CLA, because the licensor keeps the right to offer the hosted service and to license the code commercially. Modified files must say they were changed (`NOTICE`). Because of the hosting restriction Ziffr is "source-available" or "fair source", never called "open source".

## Considered Options

- **AGPL-3.0 with a trademark policy** (the Metabase, Plausible model): real open source and every hosted change gets published, but anyone may still run a commercial hosted Ziffr under another name. Rejected: "no commercial service by others" was the firmer requirement.
- **AGPL-3.0 plus a "no selling" clause (Commons Clause)**: rejected. AGPL §7 lets recipients remove such further restrictions, so the clause would not hold.
- **n8n's Sustainable Use License**: close to what we want, but a custom text that never turns open source. BSL is a standard text with parameters, and the conversion to AGPL is a promise contributors can rely on.
- **PolyForm Noncommercial**: rejected, it would forbid companies running Ziffr for their own business.

## Consequences

- The README, the website and package metadata say "source-available", not "open source"; OSI-only directories will not list Ziffr.
- An `ee/` folder exists from the first public commit, even if empty, so paid features never need code that was published under BSL to be relicensed.
- The license texts, the Additional Use Grant, the CLA and the business license are reviewed by a lawyer before the first public release.
