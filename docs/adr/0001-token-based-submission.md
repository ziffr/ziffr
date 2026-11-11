# Observations are matched to metrics via tokens, not inferred from content

Every incoming value is checked against a token that links one submitter to one metric. The token is usually invisible, implied by the sender's identity and the channel the value arrived on, and the metric's submission rule decides what a second value for the same period does (reject, overwrite, add up, keep both). We chose this over letting the app guess the metric from free text ("we closed 3 deals today") because a metric must be defined before it can receive values, because sources like mail and Slack are noisy and spoofable, and because duplicate and overwrite decisions need a known submitter and period to be made reliably.

## Considered Options

- **Strict message format** (`deals: 3`): rejected, since people won't learn a syntax per channel.
- **Free-text inference with confirmation**: rejected as the matching mechanism. It may still come back later as a convenience on top of tokens, for example to parse a value from a reply to a prompt, but it never replaces the token check.
- **One-shot token per period**: rejected. Duplicate handling belongs to the metric, and a fresh code every period is too much friction.
