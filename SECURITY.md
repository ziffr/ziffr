# Security

Please do not open a public issue for a vulnerability. Report it privately through GitHub's "Report a vulnerability" (Security tab) [TODO before publishing: or the security contact address]. We confirm within three working days and agree on a fix and disclosure date with you.

## What we care most about

Ziffr holds the numbers people track, often sensitive ones, so the boundaries are the product:

- **Visibility:** someone sees a metric, dashboard, deck, thread or delivery they were not given (Shares, Groups, Tokens, Stand-ins, View Links).
- **Acting as someone else:** submitting, approving, replying or changing on behalf of another person, or through a Connector reply that is not theirs.
- **View Links:** anything beyond the one dashboard or deck, or a link working after it expired or was revoked.
- **Locks and approvals:** changing a locked period or skipping an approver.
- **API and MCP:** a token or tool call reaching beyond its scope.

What we protect, from whom, and how each threat is met and tested: [docs/security/threat-model.md](docs/security/threat-model.md).

## Supported versions

Only the latest release gets security fixes.
