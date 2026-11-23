# 0049 Feedback: people tell us what is wrong or missing, and hear back, without a GitHub account

**Status:** in progress (tickets 1 and 3 built: the store and the bridge out, which needs a security review before it is switched on). **Ticket:** tracking issue #914, tickets #915, #916, #917, #918, #919, #920 (the owner's wish, 2026-11-23).

## Problem Statement

Most people who use Ziffr have no GitHub account and should not need one to tell us a screen is confusing or a number is wrong. Today feedback has nowhere to go from inside the app. Operators who run their own Installation do have GitHub and can file issues and discussions themselves.

## Solution

**Only in the central version (ziffr.net).** Self-hosted Installations do not show any of this; their operators use GitHub directly.

1. **Send feedback** in the user menu and in the help panel (spec 0050): a form in the side panel. The person chooses a kind (a problem, an idea, a question), writes their words and may add a screenshot. Ziffr adds the page route and the app version. It never adds Metric names, values or any other Workspace data.
2. **A bridge to GitHub.** Ziffr keeps each feedback as a conversation (a Thread, like Tasks and Questions) and files a GitHub issue (a problem) or a discussion (an idea or a question) in the public repository through a Ziffr account, **never naming the person**. The post says "from a Ziffr user" and carries the words, the route and the version.
3. **Answers come back.** A comment on the GitHub issue or discussion is added to the person's Thread and tells them as a Task or Question does. What they write back in the Thread is posted to GitHub the same way, still anonymously. Closing or reopening on GitHub shows as the feedback's status.
4. **My feedback**: a list of what a person sent, with its status (waiting for review, open, answered, closed).
5. **Post directly or review first**: a setting for the operators of the central version. **Post directly** is the default; with **review first**, each feedback waits for a maintainer to approve or edit it before it is filed. A change applies to new feedback; what already waits stays waiting.

## User Stories

1. As a person using Ziffr, I want to say what bothers me without making an account elsewhere, so that I actually do it.
2. As that person, I want to see when someone answers, in Ziffr, so that I do not have to look anywhere else.
3. As that person, I want to be sure my name and my numbers do not appear on a public page, and to be told that my words do, so that I choose what I write.
4. As a maintainer, I want feedback to arrive as GitHub issues and discussions in the place we already work, so that there is one list.
5. As a maintainer, I want to switch to review-first if spam or personal data appears, so that I can stop it before it is public.
6. As an operator of a self-hosted Installation, I want none of this in my Ziffr, so that nothing leaves it.

## Implementation Decisions

### Words

**Feedback** is new: a message from a person to the Ziffr team, kept as a Thread. It is not a Finding (an observation about numbers) and not a Question or Task (which are asked of a person in their Workspace). Add it to GLOSSARY with those avoids. A person's **My feedback** is the only list they see; maintainers see the queue in the central operations area, not in any Workspace.

### Who and where

- Only a signed-in person on the central version can send (not a View Link viewer, not a Token).
- Feedback lives outside any Workspace's data: a separate store, never part of a Workspace or its Export. The central-only code sits in `packages/core` in one module (`feedback.ts`), gated at every call by `ZIFFR_CLOUD_KEY` (the same test as the cloud API) and imported by nothing else, as the repository's other central-only code is (there is no `ee/` yet). The tables exist in every Installation, so the schema is one, but only the hosted version ever writes to them.
- A rate limit per person and per Workspace (a few a day), and a size limit on the words and the screenshot, checked on the server.

### The bridge

- Filing: a worker takes approved feedback and creates the issue or discussion through the GitHub API with a Ziffr bot account, labelled by kind. The link between the post and the person is kept only in our store; the post shows an opaque reference.
- Coming back: a GitHub webhook (verified by its signature) on comments and on state changes; a comment by anyone but the bot is added to the Thread and notifies the person. Comments by the bot's own account (relayed replies) are not echoed back.
- Anonymity is a property of what we send, so it is tested: the payload to GitHub is built from the words, the route, the version and the kind, and a test fails if anything else (names, emails, Workspace ids, Metric data) can reach it. The form says plainly that the words are public. The person may edit or withdraw their words before filing (when review first is on) and may ask for them to be closed afterwards.
- Before words are posted to GitHub, @-mentions are neutralised (so nobody is pinged or impersonated) and zero-width and bidirectional control characters are removed.
- Besides the per-person (5) and per-Workspace (20) limits, a daily cap for the whole Installation (ticket #947), so many accounts cannot flood the bridge: 200 a day unless the central operator moves it (Installation Setting `ZIFFR_FEEDBACK_PER_DAY`, 20 to 100,000, never off). Counted in the same transaction as the others; over it, the person reads "Feedback is paused for today. Please try again tomorrow." and nothing is stored.
- Replies to a person go to the same place Task and Question notices go (spec 0034's channels, their email).

### The switch

A central setting `feedback.mode` = `direct | review`, default `direct`, changed by an operator in the central operations area and recorded. In `review`, a maintainer sees the queue, may approve, edit (the person is told the words were edited) or reject with a reason that is sent to the person.

## Testing Decisions

- Database tests for the store and its permissions: a person sees only their own feedback; nothing of it is in any Workspace export.
- A test of the outgoing payload that proves nothing personal can reach GitHub, with property-style inputs (words that contain an email, a name, a Metric).
- The webhook: signature checks, replay, an unknown issue, a comment by the bot.
- The bridge against a stub of the GitHub API; one real try on a test repository is the owner's.
- The setting: switching modes affects only new feedback.

## Tickets

1. Feedback store, permissions, rate limits and My feedback list (central only). (First.)
2. The form in the side panel and the entry in the user menu. (Blocked by 1 and by spec 0050's panel.)
3. The bridge out: filing, the opaque reference, the anonymity test. (Blocked by 1.)
4. The bridge back: webhook, Thread comments, notices, statuses. (Blocked by 3.)
5. The review queue and the mode setting. (Blocked by 3.)
6. GLOSSARY, the user guide chapter, the threat model entry. (With 2.)

## Out of Scope

- Feedback in self-hosted Installations.
- Telling people about similar open issues while they type (a later idea).
- Voting, public profiles or showing people's feedback to others.
- Support requests that need a person to look at a Workspace: those stay with support, not this form.

## Further Notes

Feedback is the first thing in Ziffr that sends words to a public page on a person's behalf, so the threat model gets an entry: personal data in the words, abuse, and a leaked link between person and post.
