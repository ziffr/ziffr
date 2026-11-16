# Specs

A spec says what we are building, why, and how we will know it is done. Every piece of work bigger than one pull request starts with one.

- **Where:** `docs/specs/NNNN-slug.md`, numbered in order like the ADRs. Nowhere else.
- **Status** at the top of each spec: `draft`, `in progress` or `done`.
- **Tracking:** each spec has one GitHub tracking issue (label `tracking`); its tickets are sub-issues of it, labelled `spec:NNNN`. GitHub shows the progress bar on the tracking issue.
- **Tickets** are small enough for one pull request, say what they need first (blocked by #…), and say how to check they are done.
- **Ticking off:** every pull request says `Closes #<ticket>`; merging closes the ticket and moves the progress bar. A pull request without a ticket is not merged.
- **Finishing:** the pull request that closes the last ticket also sets the spec's status to `done`.
- **Changing course:** a spec is changed by pull request like code, so its history stays visible. Decisions that are hard to reverse go into an ADR, not the spec.

Specs 0001 to 0015 were written in an earlier, private repository. The issue and pull request numbers in them (such as "tracking issue #201") refer to that repository, not to the issues here.
