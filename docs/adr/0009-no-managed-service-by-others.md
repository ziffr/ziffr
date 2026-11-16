# Others may set Ziffr up for a client, but not run it for them as a managed service

This replaces one part of ADR 0002. ADR 0002 let anyone "install, configure and operate" Ziffr for a client on infrastructure the client controls. A firm could have used that to run Ziffr for many clients, each in the client's own cloud account. That is a managed Ziffr service in all but name, and it would compete with the hosted offering the licensor keeps for itself. The Additional Use Grant now lets others install, configure and support Ziffr for a client who uses it for its own internal business. Running or managing it for a third party on an ongoing basis counts as a managed offering and is reserved, whether the servers are the provider's or the client's. Everything else in ADR 0002 stays: production use inside your own organisation and its affiliates, the paid `ee/` folder, MIT for what others build on, and AGPL after three years.

## Considered Options

- **Keep ADR 0002's grant unchanged**: rejected. "On infrastructure that client controls" let a provider run a managed service and say it was only operating the client's install.
- **Forbid any work for a third party, including setup and support, and exclude affiliates**: rejected. No comparable project goes this far (n8n, Elastic and Sentry all allow consultants and internal use across a group). It would scare off companies that bring in IT help, which is how Ziffr would spread. It also does nothing extra for the hosted offering.
- **Switch to the Functional Source License (FSL)**: a standard text with the same "no competing use" idea, but it becomes Apache or MIT after two years. Kept as an option to revisit; for now BSL with AGPL after three years protects more.

## Consequences

- Consultants and IT providers may still install, configure, upgrade and support Ziffr for a client. Whoever runs it from day to day is the client.
- Managed service providers need a commercial licence from the licensor.
- Where "ongoing" ends and "support" begins is a judgement call. The lawyer who reviews the license texts before the first public release (ADR 0002) checks this wording too.
