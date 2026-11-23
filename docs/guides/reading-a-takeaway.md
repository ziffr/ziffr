# Reading a Takeaway

When Ziffr looks at your numbers (which Metrics move together, what a Metric is heading for), it does not show you a table. It tells you in a sentence, in your own Metrics' words and units. That sentence is a **Takeaway**. This page says how to read one, in plain words. You need no statistics.

## What a Takeaway holds

- **A sentence**, such as "Visits and Revenue tend to move together over 18 months (strong)."
- **A strength word** in brackets: strong, moderate, weak, or can't tell from chance.
- **What it is based on**: how many months (or weeks, or days) it looked at, and whether it compared the numbers themselves or how much they changed from one period to the next.
- **A plain line above the sentence** when something about your data makes the reading rough. This is a caution.
- **A footer**: for a link between Metrics, "This shows what has gone together, not what caused what."; for a forecast, "This carries the past forward; it is not a promise."; for a change point, "This shows when the numbers changed, not what made them change."; for a before-and-after look, "This compares what happened with where the earlier trend pointed; it does not show what made the difference."; for a value that is unusual for the time of year, "This compares the value with the earlier ones at this time of year; it does not show what made it differ." A Takeaway about one Metric's own values read as they are (what is usual, a share of a whole) or a sum worked out exactly has none.
- **Show the numbers**, a fold-out for people who want to check: the method, the exact figures and the periods used.

## The four strength words

| Word | What it means | What to do |
| --- | --- | --- |
| **Strong** | The two clearly moved together, much more than luck would give. | Worth acting on, and worth asking why. |
| **Moderate** | They moved together noticeably, but with a lot of other things going on. | Worth a look. Do not lean on it alone. |
| **Weak** | A little of a link, which could be real or could be luck. | Treat it as a hint, not a finding. |
| **Can't tell from chance** | What Ziffr sees is no clearer than what luck alone could produce. | Do not read anything into it. This is an answer too: it says there is nothing to see, or not enough to see it. |

The last word appears as often as the others, on purpose. Two numbers that happen to wander the same way for a while are common, and it is better to be told so than to be shown a number that looks meaningful.

A result that comes with a caution is never called strong, however close the numbers look.

## Growth removed

Two Metrics that both grow over time, such as revenue and the number of employees, look closely related even when nothing links them. So where both grow in a clear trend, Ziffr compares how much each changed from one period to the next instead, and says "compared by change, growth removed". Two Metrics that only share a trend then come out as "can't tell from chance", which is the honest answer.

## A range, not a verdict

Some Takeaways have no strength word, because they do not say whether two things go together. "After 1 Mar 2026, Signups ran about 12.0 % above where its trend pointed (likely between +8.1 % and +16.2 %; that range leaves out zero)." is a range. "Likely between" is the range the answer holds about four times in five. Read it like this:

- **Both ends on the same side of zero** (both plus or both minus): the Metric did run away from its trend, by about that much. The Takeaway does not say why; other things may have changed on the same date.
- **The range holds zero** (one end minus, one plus): the Metric did not leave its path by more than the range allows. The sentence says "that range includes zero". The words say what the range is and do not call it a finding: with no real change, about 1 range in 5 still leaves out zero by chance.
- **A Metric set beside it**, one the change should not have touched, shows what ordinary ups and downs look like. If it moved too, the Takeaway says something else may have moved both.

"Around March 2026, Signups changed: before, it went up 5 € a month; since, down 3 € a month" says on which date a Metric's level or trend changed. It is the date that fits best; nearby dates may fit almost as well. It is only said when the change stands out from what luck would give among all the dates that were tried; otherwise the Takeaway says nothing stands out.

## A caution

A caution is one plain line above the sentence. The result is still given, and Ziffr tells you why to read it with care. Examples:

- "This result is pulled by 2 months far from the rest; without them it reads moderate." A few unusual periods drive the result. Look at those periods. Ziffr does not remove them for you.
- "Visits: no value for 2 of 24 months, left out." Periods without a value are skipped, never filled in.
- "This link was stronger earlier than it has been since." Check whether something changed.
- "The link looks curved, so a straight-line reading is rough."

## A refusal

Sometimes Ziffr says it cannot give a result, with the reason in words and no number:

- "Not enough months yet: 9 of 16 needed." Wait for more values.
- "Support tickets has hardly changed, so there is nothing to compare."
- "Visits: no value for 3 months in a row, too many to go on."

Asking again, or choosing the method yourself, does not turn a refusal into a number. Fix what the line says, or wait.

## Likely between

A forecast, a what-if and some other results give a range: "expected 150,461 € in September 2026 (likely between 144,969 € and 155,953 €)". The range is where the answer lands about four times in five if the past carries on. It is not a promise and not the worst case: about one time in five it is outside. A wide range says Ziffr is less sure; a range that does not change sign says the direction is clear even where the size is not.

Under a forecast, a line says how it did on the periods already known: "Over the last 12 months, the range for the next month would have held 10 of 12 times." The range is meant to hold about 10 of 12 times; a record far below that means it was often too narrow, so lean on it less.

A chance such as "about 4 in 10" or "at least 19 in 20" is the same kind of reading: how much of the likely range is on the right side of the Target. It is as good as that record, not a prediction that the Metric will get there.

## Held the same

"With Price held the same, Visits moved with Revenue the most" means Ziffr looked at what is left of the link between two Metrics once the others you named were taken out of the picture. It answers "is it really Visits, or does Price explain both?" It does not say that Price does not matter, and it does not say what would happen if you changed Price.

## Treated as one

"Orders and Operating cost move so closely together that Ziffr cannot tell which of them matters, so they are counted as one" means two Metrics rose and fell so alike that no number can say which one the result belongs to. Ziffr keeps one of them (the one that moves more closely with the Metric you asked about), shows the effect for each unit of that one, and says so. The other is not unimportant; it is not separable from the first in these numbers. Where three or more Metrics move closely together as a group, Ziffr keeps the result when the closeness is moderate, names the crowded Metrics, says their separate effects are less certain and calls none of them strong; when it is extreme, Ziffr refuses and names them.

## Outside what was seen

"This is higher than Visits has ever been (highest 51,000), so treat it as a guess" means you asked about a value, or a change in one month, bigger than anything in the history. The straight line through the past does not say what happens out there, so Ziffr gives a point and no range, and says it is a guess. "(its largest was 28)" is the biggest change in one month that Metric has had. Believe the sentence over the number.

## Worked out and estimated

"Worked out" means arithmetic: a share, a sum, a Derived Metric's formula, what each part added to a change. It has no range, because there is no doubt. "Estimated" means read from how the Metrics have gone together, and it has a range. In a what-if, the picture sets the two apart. A what-if with several steps has wider ranges for the Metrics further along, because each step adds doubt, and it says the links were picked for standing out, which makes effects look larger than they are: read it as a first look.

## When Ziffr says it cannot tell

Some lines are about the data, not the result. Read them as the reason to wait or to look at the numbers yourself:

- "Too few months to check the yearly pattern against a plain trend, so a plain trend is used." Ziffr needs two years of a Metric to look for a yearly pattern; it forecast with a straight trend instead.
- "The past values fit this pattern with no miss at all, so the range and the chance may be too sure." The history was too tidy for Ziffr to know how far off it can be.
- "The ups and downs of Signups run in long swings from one month to the next, and a long swing can look like a change; read this with care." A slow wave can look like a turn. Wait for more months before acting.
- "Pairs not scanned" under Show the numbers of a Heads-up: Ziffr ran out of working time for some pairs and did not look at them. It never makes a Heads-up from them, and the bar for the others is not lowered.

## Heads-ups

A Heads-up is a Takeaway Ziffr tells you without being asked. It has the same words and the same footer. Quiet is a result: the list says "Nothing stands out right now" when that is true. There are five kinds:

| Kind | Reads like | What it does not say |
| --- | --- | --- |
| Started moving together | "Support tickets and Churn rate have started moving together: when Support tickets rises, Churn rate follows 2 months later (strong, over 18 months)." | That one makes the other happen. |
| Stopped moving together | "Visits and Revenue used to move together. Over the last 6 months, they have not." | Why, or which of the two changed. |
| Turned around | "Signups turned around in January 2026: up 3 a month before, down 9 a month since." | What made it turn, or that it will go on. |
| Target out of reach | "Revenue is unlikely to reach 1,500 € or more in January 2027 (under 1 in 20)." | A promise either way: it carries the past forward. |
| Unusual for the season | "Visits's 116 in October 2026 is high for this time of year: it is usually between 77 and 83." | Whether it is good or bad. |

A Heads-up appears only after Ziffr has checked it against everything it looked at, so that on a Workspace full of ordinary ups and downs it stays quiet. A Heads-up needs a clear link; a weak one is never reported, however sure. Each is shown once, and you can mark it **Not useful** or **Mute** a Metric.

## What a Takeaway never says

It never says that one Metric caused another, never says "because", and never shows a statistics term you would have to look up. If you want the technical names, **Show the numbers** has them, and the [Methods guide](methods.md) explains each one.
