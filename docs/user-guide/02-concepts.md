<!-- part: Understanding Ziffr -->
# The ideas behind Ziffr

A handful of ideas explain almost everything Ziffr does. Once they are clear, the screens make sense on their own.

## A number is described before it is collected

In Ziffr every number you track is a **Metric**. Before anyone can send in a value, the Metric is described: its name, what it means, its unit (euros, hours, percent), how often it is counted (each day, week, month, quarter or year), what a good value is, and who is responsible for it. That person is the **Metric Owner**.

This sounds like extra work, but it is what makes the numbers trustworthy. Everyone reads "Revenue" the same way, and nobody has to guess whether it includes tax.

A Metric can also be worked out from other Metrics, such as "Gross margin" from revenue and cost. That is a **Derived Metric**: it is never sent in, Ziffr calculates it. The demo has some; there is no screen yet for making your own.

## Every value belongs to a period

One value of a Metric for one period is an **Observation**: "Revenue, October: 84,000 €". A value can carry a **Breakdown** that splits it, such as revenue by country, and a Metric can also have a **Target Series** (a budget per month) and **Projections** (values expected for coming periods).

When a second value arrives for the same period, the Metric's **Submission Rule** decides what happens: the new value replaces the old one, the two are added up, both are kept, or the second one is refused.

When a longer period is shown, the **Aggregation** decides how values combine: revenue is added up, a satisfaction score is averaged, a bank balance takes the last value. A Widget can show a monthly Metric by quarter, half-year or year this way; that longer period is its **Display Period**, and the one still running is marked "to date".

## Someone gives each value

The people who send in values are **Submitters**. A Submitter can be a Member of the team, a Guest, a **Contact** who never logs in (a bookkeeper or a shop manager), or a **Feed**, a program that reads another system.

Values arrive through a **Source**: the personal form link, email, Slack, or the API. Ziffr knows who may send which number. Behind every value stands a **Token**, the standing permission that links one Submitter to one Metric. People never see tokens; they simply answer the message they got.

## Ziffr asks, reminds and checks

A **Workflow** is the path a Metric's value takes each period. A typical one, such as "Monthly finance close", does this:

1. **Ask.** When the period ends, Ziffr sends each Submitter a **Prompt**: "What was revenue in October?"
2. **Remind.** Before the **Due Date**, counted in working days (for example the 3rd working day), Ziffr reminds whoever has not answered.
3. **Escalate.** If the value is still missing, an **Escalation** asks the person's **Stand-in** or tells the Metric Owner. People who are **Away** are skipped and their Stand-in is asked instead.
4. **Check.** A value that changes much more than usual, or falls outside its target, is an **Unusual Value**. It needs **Approval**: the Approver confirms it, corrects it, or sends it back with a comment. Until then it shows, marked as not approved yet.
5. **Lock.** When the period is complete, it is **Locked**. A late value or a correction becomes a proposal that needs Approval again, and only the Metric Owner can unlock a period, with a reason.

Several Metrics can share one Workflow, and its owner can close a period for all of them at once.

## Good and bad are defined, not guessed

Each Metric has a **Target Range**, the band its values should stay within, and a **Polarity**: whether higher is better (revenue), lower is better (cost), or closer to the target is better (stock level). From that, Ziffr colours values green or red, works out **Attainment** (how far a value reaches its target, as a percentage where higher is always better), and spots Unusual Values.

A **Comparison** sets the latest value against an earlier span: the previous period, or the same time last week, month, quarter or year, both as a difference and in percent.

## Everyone sees what was shared with them, nothing more

Visibility is at the heart of Ziffr. Each person has a **Workspace Role**:

- **Owner**: manages the Workspace, its settings, its people and billing.
- **Admin**: the same as an Owner, except billing and removing Owners.
- **Member**: creates and shares Metrics, dashboards and decks.
- **Guest**: sees only what is shared with them, answers questions and sends in values, and creates nothing.

Metrics and dashboards are given to people or to **Groups** (such as "Management" or "Sales") with a **Share**. Someone with a Share is a **Viewer**, who can look, or an **Editor**, who can also change things. Sharing a dashboard also lets people see every Metric on it. People outside the team can see one dashboard or deck through a **View Link**, which needs no login, ends on a set date and can be revoked.

## Nothing is lost

When a value is replaced or corrected, the earlier one is kept as a **Superseded Value**. Everything people build (widgets, dashboards, decks, Metric descriptions) keeps its **Versions**, so you can go back. A dashboard's **Snapshot** keeps what it showed at the end of a week, month, quarter, half-year or year, so the numbers in last quarter's board meeting, or in the annual review, never change afterwards. The **Audit Log** records who changed who may see or do what, and which decisions were taken on numbers, and nobody can change it.

## Questions stay with the number

When a number raises a question, you assign an **Action** on that value: a **Question** ("Why is cost so high this month?") or a **Task** ("Renegotiate the shipping rate"). The **Assignee** answers in the action's **Thread**, by email or on Slack. If the value itself was wrong, the answer can propose a **Correction**, which takes effect once the Metric Owner accepts it.
