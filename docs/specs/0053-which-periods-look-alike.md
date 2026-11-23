# 0053 Which months look alike? Periods put into a few kinds, the same way every time, named by what marks them

**Status:** accepted, not started. The owner asked on 2026-11-23 to include it; the tickets below are opened once this merges and will carry `spec:0053`. Part of #693 (spec 0041). Each result can be saved as a widget, as #1021 asks of every Method.

## Problem Statement

People who look at several Metrics month after month ask a question that none of Ziffr's Analyses answers: "Which months were like this one?"

- A shop owner sees that some months have many returns and many support tickets, and others have neither.
- A team lead sees that the quiet weeks are quiet on every Metric at once.
- A finance lead wants to know whether this December looks like last December or like a normal month.

They want the months sorted into a few kinds, each kind said in words ("months with high Returns and high Support tickets"), and the months of each kind listed, so that they can look back at what those months had in common.

Spec 0041 left this out on purpose ("Out of the first wave, on purpose"), for three reasons that hold for the way programs usually group things:

1. **A group found by a program is hard to say in one sentence without being wrong.** "Your months fall into three groups" sounds like a finding about the business. Yet the program would have cut any cloud of points into three, including one with no kinds in it at all.
2. **Two runs can differ.** The usual method (k-means) starts from random points, so the same data can give other groups tomorrow. A Takeaway that changes when nothing changed cannot be trusted or cited.
3. **The number of groups is a choice.** Whoever picks it picks the answer.

This spec answers each of the three:

- a fixed method with no randomness and a written tie rule, so that the same values always give the same kinds, on every machine;
- a number of kinds that the person picks, or that a written rule picks and the sentence names;
- a check, worked out exactly and measured against noise, that says "can't tell from chance" when the kinds are no clearer than unrelated Metrics would give;
- a plain footer that kinds describe and do not explain.

Nothing of this is in the app today, and nothing says "coming soon": a person sees it first when ticket 5 ships.

## Solution

One new Method, `lookAlike`, behind the question **"Which months look alike?"**, in the Period's own word ("Which weeks look alike?", "Which quarters look alike?"). It is reached from the method picker and saved as a widget.

1. **The periods.** The person names 2 to 6 Metrics. Ziffr takes the periods in which every one of them has a value, on their Common Period, the latest 60 at most.
2. **One scale.** Each Metric is read as it is, or as its distance from its own straight-line trend where it clearly trends (the rule of basis choice, spec 0041 rule 2). Each is put on its own scale: a value's distance from the Metric's mean, in the Metric's own spread.
3. **Kinds by Ward's method.** Start with every period alone, and join, again and again, the two kinds whose joining adds least to the spread inside the kinds. Ties are broken by a written rule. The person picks 2, 3 or 4 kinds, or leaves it to Ziffr, which takes the count whose kinds stand furthest apart and says so. Every kind holds at least a sixth of the periods.
4. **Are the kinds clear?** Ziffr measures how far apart the kinds stand (the **gap**) and does the same on 99 shuffled copies, in which each Metric's values are put in another order of periods, so that the Metrics have nothing to do with each other. Kinds are clear only when the real gap beats at least 96 of the 99 shuffles (all 99 when a Metric changes slowly) and is at least 3. Otherwise the Takeaway says "can't tell from chance" and names no kind.
5. **Each kind is named by what marks it:** at most two Metrics on which its periods lie clearly above or below the other periods ("months with high Returns and high Support tickets"). Its periods are listed as ranges ("Nov 2024 – Jan 2025, Nov – Dec 2025"). A kind that keeps to the same time of year says so ("mostly November to January").
6. **One footer, every time:** "This describes which months look alike, not why."

Every step is worked out exactly on the values' text, and none needs a square root (Implementation Decisions).

### Words

| Word | Meaning | Not |
| --- | --- | --- |
| **Look-alike** | The Analysis "Which months look alike?": a Method that puts the periods of 2 to 6 Metrics into 2 to 4 kinds by how the Metrics stood in them, names each kind by what marks it, and says whether the kinds are clearer than chance. | Clustering, segmentation, cluster analysis |
| **Kind** (of period) | One of the sets of periods a Look-alike puts together: "months with high Returns and high Support tickets". Kinds are numbered by their earliest period. | Cluster, group (a **Group** is a set of people), segment, class, cohort, bucket |
| **Gap** (between kinds) | How far apart two kinds stand: the distance between their middles, counted in the typical spread of their periods along the line that joins the middles. A bell-shaped cloud of noise cut in two has a gap of about 2.65. Used in documents and **Show the numbers**. | Separation index, silhouette |

`GLOSSARY.md` gets **Look-alike** in ticket 1, with **kind** and **gap** in its text. The **Analysis** entry's example "clustering" becomes "which periods look alike". A person reads "kind of month", never "cluster" or "group".

## The question and the Takeaway

### What the person asks and what they read

| The person asks | The Takeaway says |
| --- | --- |
| Which months look alike, on Returns, Support tickets and Revenue? | "Over 36 months, Returns, Support tickets and Revenue put the months into 3 kinds (moderate; Ziffr picked 3, where the kinds stand furthest apart). **Months with high Returns and high Support tickets:** Nov 2023 – Jan 2024, Nov 2024 – Jan 2025, Nov – Dec 2025, mostly November to January. **Months with low Revenue:** Jul – Aug 2023, Jul – Aug 2024, Jul – Aug 2025, mostly July and August. **Months close to the usual on every Metric:** the other 20 months." Footer. |
| The same, 3 kinds asked for, and the months do not fall apart | "Over 36 months, Returns, Support tickets and Revenue do not fall into clear kinds of month: split into 3, the kinds stand no further apart than they would for Metrics that have nothing to do with each other (can't tell from chance)." No kind is named, and the strip is grey. Footer. |
| The same, kinds marked by Returns alone | The "can't tell" sentence, and "Returns alone sorts the months; to see when it is high, use What is usual for it?". |
| The same, with 18 months in common | "Not enough months in common yet: 18 of 24 needed." No number. |

The sentence:

- uses the Metrics' own names and the Period's word;
- writes values in the Workspace's Number Style and each Metric's unit;
- says "for its trend" after a Metric read as its distance from its trend ("months with high Revenue for its trend");
- says "high" or "low", never "good" or "bad", whatever the Metric's Polarity: a kind describes and does not judge.

### How a kind is named

For each kind and each Metric, Ziffr goes over every pair of a period in the kind and a period outside it. It counts how often the one in the kind is higher, takes away how often it is lower, and divides by the number of pairs (Cliff's delta: a fraction from −1 to 1, exact). It reads as "a month of this kind is above a month outside it this much more often than below".

| The count | The word | It means (no ties) |
| --- | --- | --- |
| at least 4/5 | "very high" | above a month outside it at least 9 times in 10 |
| at least 1/2 | "high" | at least 3 times in 4 |
| between −1/2 and 1/2 | (not named) | |
| at most −1/2 | "low" | below at least 3 times in 4 |
| at most −4/5 | "very low" | below at least 9 times in 10 |

- A kind is named by at most two Metrics, those with the largest size of the count, ties by the Metric's id.
- A kind with none is "months close to the usual on every Metric".
- Two kinds that would get the same words are told apart by a third Metric where one has it; failing that, by "(1)" and "(2)" in the order of their earliest period.
- **Show the numbers** has, per kind and Metric, the kind's middle value (median), the other periods' middle value and the count, all exact, and for the whole: the count of kinds and why, the gap of every two kinds, how many of the 99 shuffles reached the real gap, and the periods used.

### How the periods are listed

- A kind's periods are written as runs of periods that follow one another, oldest first: one period alone is "Dec 2025", a run within a year "Jan – Mar 2025", a run across a year end "Nov 2024 – Feb 2025", in the Workspace's language, and by the Fiscal Year for quarters and halves.
- Past 6 runs the sentence says "and 9 more months"; the strip and **Show the numbers** list them all.
- The largest kind with no Metric named comes last, as "the other 20 months".

**Seasonal kinds.** For months, quarters and days, a place in the season is the month of the year, the quarter of the Fiscal Year or the day of the week.

- A place belongs to a kind when at least 2 of its periods in the window, and at least 3/4 of them, are in the kind.
- A kind is seasonal when its places hold at least 3/4 of its periods.
- The sentence then adds "mostly November to January": places that follow one another as a range, others listed ("mostly Saturdays and Sundays").
- Weeks and years have no season here: 52 places are too many for 60 periods, and a year has one place.

### Strength, cautions and the footer

**Strength** goes by the gap of the kinds as found, once the shuffles were beaten: at least 5 **strong**, at least 4 **moderate**, at least 3 **weak**. Below 3, or with the shuffles not beaten, **can't tell from chance**. A result with a caution is never strong (spec 0041 rule 12).

**Cautions**, one line each above the sentence:

- "Revenue changes slowly from month to month, so neighbouring months look alike on their own; Ziffr asked for more before calling the kinds clear." (A Metric changes slowly, below.)
- "Visits and Sessions move so closely that what they share counts twice here." (Two Metrics whose values have r² above 4/5, exact.)
- "3 of 27 months have no value for one of the Metrics and were left out." (Gaps under the limit.)
- "Split into 4, one kind would hold only 3 of 30 months, fewer than the 5 a kind needs, so this shows 3." (A count asked for that cannot be made: the largest smaller count that can is shown; no period is moved to make one.)

**Footer:** "This describes which months look alike, not why." (in the Period's word). It is the Look-alike's own, next to the four footers of spec 0041.

### Refusals

| Fails when | It says |
| --- | --- |
| Fewer than 24 periods in which every Metric has a value | "Not enough months in common yet: 18 of 24 needed." |
| Fewer than 2 Metrics | "Pick at least two Metrics to compare months on." |
| More than one Metric per 6 periods, or more than 6 | "Too many Metrics for 30 months: at most 5 (one for every 6 months)." |
| A Metric that hardly varies (spec 0041's "Enough that vary") | "Support tickets has hardly changed, so there is nothing to compare." |
| More than 20 % of the window's periods lack a value, or 3 in a row | As spec 0041's "Gaps". |
| A Metric of Aggregation none and another period | As spec 0019: "Churn rate has Aggregation none: it can only be compared with monthly Metrics." |
| No count from 2 to 4 gives kinds that each hold a sixth of the periods | "The months do not split into kinds of at least 5 months each." (a "can't tell" result, no kind named) |
| The work bound | "Too much to compare at once: pick fewer Metrics or a shorter span." |

## Implementation Decisions

### The series

- **Periods.** The Metrics are compared on their Common Period: the longest of their periods, the others combined by `seriesBy` (spec 0019). Only complete periods count, and only periods in which **every** Metric has a value, as in Drivers; values waiting for Approval are left out, as in every Analysis.
- **How many.** The latest 60 such periods at most (`latestCommon` with 60 instead of `MOST_PERIODS`), because the shuffles repeat the work 100 times. Ticket 2 measures it and may lower it; it is never raised past the work bound.
- **Basis, per Metric.** A Metric whose straight-line trend explains more than half of its variance is read as its distance from that line (`detrended`, exact). The test is the one-series check inside `basisFor`, exported from `basis.ts` as `trendsClearly`. Every other Metric is read as its values.
- **No changes.** "Months with high returns" is about how high they were, not how they changed, so changes on the period before are not used.
- **One scale.** Metric j gets the weight w_j = 1 / v_j, with v_j = Σ (x − x̄)² / n, its population variance, exact. A distance is never taken itself: every comparison uses the squared distance Σ_j w_j (x_ij − x_lj)², a fraction.
- **What this makes true.** Multiplying a Metric by a positive number, or adding a number to it, changes no kind; turning its sign changes no kind and only swaps "high" and "low".

### Ward's method, exactly

- **The cost of joining** kinds A and B is how much the spread inside the kinds grows: Δ(A, B) = (|A| · |B| / (|A| + |B|)) · Σ_j w_j (m_Aj − m_Bj)², with m the kinds' means. It is a fraction. It is worked out from each kind's sums every time and never updated from earlier costs, so the numbers stay as wide as the values and do not grow with the steps.
- **Joining.** Every period starts as a kind of its own; at each step the pair with the smallest cost is joined. Ward's costs never shrink from one step to the next, so the kinds at 4, 3 and 2 are the states after n − 4, n − 3 and n − 2 joins. Each count's kinds are the next count's with one split: a person who changes "How many kinds?" sees one kind split or two join, never a reshuffle.
- **Ties.** Two exactly equal costs are decided by the pair's earlier earliest period, then by the other kind's earliest period. So the kinds are a function of the values and the periods alone. Without a tie, the order in which the periods are given makes no difference; with one, the written rule decides.
- **Speed.** The definition is the plain search over all pairs. The implementation may keep each kind's nearest kind to search less; a generated test checks that it joins in the same order as the plain search, ties included.

**A hand-worked case**, the first unit test (6 periods and 2 Metrics, below the minimum, run on the Method itself): Returns 10, 12, 11, 30, 32, 31 and Support tickets 5, 6, 5, 20, 21, 19.

- Means 21 and 38/3, variances 302/3 and 488/9.
- Joins: periods 1 and 3 (cost 3/604), 4 and 6 (2091/147376), {1, 3} and 2 (501/18422), {4, 6} and 5 (6273/147376), and the two kinds (109713/9211).
- The gap of {1, 2, 3} and {4, 5, 6}: gap² = 10699504328/24093453, a gap of about 21.1.
- Checked for this spec with Python's `fractions`; ticket 1's reference reproduces each fraction.

### The gap and the number of kinds

- **Gap** of kinds A and B. Let d be the difference of their means and S their pooled spread: for each pair of Metrics, the sum over both kinds of the products of each period's distances from its kind's mean, divided by |A| + |B| − 2. Then gap² = (dᵀd)² / (dᵀ S d), where dᵀd uses the weights w_j and dᵀ S d the weights w_j · w_l. It is a fraction, so no square root is needed.
- **Of a set of kinds** the gap is the smallest gap of any two of them. Two kinds with no spread at all along d have an endless gap, larger than every fraction.
- **Why the gap and not the silhouette.** The silhouette (the usual measure of how well points sit in their group) rates a single bell curve cut in two as a fair split (0.56 for one Metric, measured), falls as Metrics are added, and needs square roots. The gap is about 2.65 for a bell curve cut in two, whatever the Metrics' spreads and however they move together. A tilted cloud of two Metrics that simply move together in a line is not taken for two kinds.
- **The count.** A count the person picks (2, 3 or 4) is used as it is. Otherwise Ziffr tries 2, 3 and 4 and takes the one with the largest gap (squared gaps compared exactly), ties to the smaller count.
- **Smallest kind.** A count is only tried when each of its kinds holds at least max(3, ⌈n / 6⌉) periods: 4 at 24 periods, 10 at 60. A far-off month therefore never makes a kind of its own. It stays in the kind nearest to it; the shuffles are not misled by it, so spec 0041's far-off check does not apply here.

### Are the kinds clear?

- **Shuffles.** The Metrics are taken in the order of their ids, so the order a person picked them in changes nothing. The first stays as it is. Each other Metric's values are put in another order of the periods by a Fisher–Yates shuffle driven by SplitMix64, the 64-bit generator, with the seed r · 16 + j for shuffle r (1 to 99) and Metric j (2 to 6). It is worked out on BigInt, so the reference gets the same 99 orders.
- **What a shuffle keeps.** The basis and the weights of the real series (a shuffle does not change a Metric's spread). The kinds, the count (by the same rule, or the person's) and the gap are worked out again for each shuffle.
- **The rule.** c is the number of shuffles whose gap² is at least the real gap². Kinds are clear when (1 + c) / 100 is at most 1/25 (c at most 3) and the gap is at least 3 (gap² at least 9). The bar is 1/25, not 1/20, so that the false-claim rate stays under 5 % with room for scatter.
- **Slow Metrics.** When a Metric changes slowly, the bar is 1/100 (c = 0). Slowly means its von Neumann ratio, Σ (x_t − x_{t−1})² over periods that follow one another divided by Σ (x_t − x̄)², is below 1/2: exact, about 2 for values that do not follow their own past, near 0 for a running total. A slow Metric's months look like their neighbours whatever the other Metrics do, and the shuffles, which break that order, would otherwise call it kinds.
- **What the shuffles promise.** When the periods are independent of each other and the Metrics of each other, the real data is one more shuffle among a hundred. The rule then claims clear kinds at most about 1 time in 25, whatever the shape of the values: skewed, with ties, with far-off values. It reads only how the Metrics line up. The 99 orders are fixed, so this is shown by the simulation and not proved for every input. It does not hold for Metrics that follow their own past; slow Metrics ask for more for that reason, and the simulation measures what is left.
- **What it costs.** Kinds that come from one Metric alone (Returns is high every December and nothing else is) are not called clear, because each shuffle keeps Returns' own Decembers. The Takeaway says "can't tell" and points to What is usual? for that Metric. It is the right answer to "which months look alike across these Metrics", and the false comfort this spec refuses to give.

### Measured

The simulation done for this spec: Python with SciPy, the same rules in doubles, 300 runs per case for 2 and 3 Metrics and 250 for 4 and 6, 99 shuffles each, with the bar at 1/20 (c at most 4). The share of runs called clear, in %:

| Case | 2 Metrics, 24 periods | 3, 24 | 4, 24 | 6, 36 |
| --- | --- | --- | --- | --- |
| Independent, bell-shaped | 6.7 | 4.0 | 4.4 | 2.8 |
| Independent, flat (uniform) | 3.3 | 5.3 | 7.2 | 5.2 |
| Independent, skewed (lognormal) | 3.0 | 4.7 | 6.0 | 4.8 |
| Independent, heavy-tailed (t, 3 degrees of freedom) | 5.3 | 7.3 | 8.4 | 5.6 |
| Independent, counts with ties (Poisson, mean 1) | 5.3 | 3.7 | 7.2 | 6.4 |
| Moving together in a line (r = 0.8), no kinds | 4.3 | 1.7 | 1.6 | 0.0 |
| Skewed and linked (lognormal, r = 0.5) | 6.7 | 5.3 | 4.0 | 2.0 |
| Following their own past (AR(1) 0.5) | 7.7 | 5.7 | 4.8 | 9.2 |
| Following it closely (AR(1) 0.8) | 4.7 | 3.3 | 5.6 | 9.2 |
| Running totals (trend removed) | 3.7 | 3.7 | 2.4 | 11.6 |
| Kinds from one Metric alone (3 spreads, months 10 to 12) | 5.3 | 4.3 | 5.2 | 6.0 |
| **Shared kinds:** months 10 to 12 two spreads higher on every Metric | 16 | 25 | 39 | 93 |
| **Shared kinds:** three spreads higher | 47 | 82 | 93 | 100 |
| **Three planted kinds,** set apart by 3 spreads on 2 of the Metrics | 65 | 31 | 20 | 22 |
| The same, by 4 spreads | 97 | 70 | 44 | 37 |
| A smooth yearly wave on every Metric | 1.0 | 0.7 | 0.0 | 2.4 |

How to read it:

- On independent values the share is at about 5 % whatever their shape, as the shuffles promise. Single cells scatter by about 1.3 points at these run counts, which is why the bar is set at 1/25 for the release.
- Kinds that all Metrics share are found more easily the more Metrics share them. Kinds carried by 2 Metrics are blurred by every Metric added that has nothing to do with them (65 % with 2 Metrics, 22 % with 6): the Methods guide says to add only Metrics that matter together.
- Kinds of one Metric alone are not called clear, as decided.
- A smooth yearly wave is a circle, not kinds, and is not called clear (open question 1).
- Values that follow their own past are what is left. At 6 Metrics they reach 9 to 12 % with the slow-Metric rule in place.

A second run, with the bar at 1/25 and 150 runs per case, measured the slow-Metric rule on its own (% called clear):

| Case | Without the slow-Metric rule | With it |
| --- | --- | --- |
| Running totals, 2 Metrics, 36 / 60 periods | 14 / 16 | 6 / 8 |
| Running totals, 4 Metrics, 36 / 60 periods | 12 / 44 | 7 / 21 |
| AR(1) 0.8, 2 Metrics, 36 / 60 periods | 9 / 14 | 5 / 9 |
| AR(1) 0.8, 4 Metrics, 36 / 60 periods | 18 / 19 | 8 / 5 |

Running totals over 60 periods are the worst case, and values that follow their own past closely stay at 5 to 9 %. A Look-alike with a slow Metric therefore always carries its caution, is never strong, and the Methods guide says not to use it on running totals.

The gap of 3 and the bars of 1/25 and 1/100 are written once, in the Takeaway layer's thresholds (`takeaways/strength.ts`). Each is tested at the threshold and one step either side, as in spec 0041. Ticket 2 repeats this table at 2,000 runs per case through the real, exact path, with the bar at 1/25, for 24, 36 and 60 periods, and replaces the table here with it.

### Exactness, the work bound and caching

- **Exact.** Means, variances, weights, squared distances, Ward costs, the pooled spread, gap², Cliff's count, the von Neumann ratio, medians and the r² of two Metrics are fractions on the values' text (`exact.ts`). No decision uses a square root, a distribution or a double. A double appears only where a number is shown: the gap in **Show the numbers**, as the double nearest to the square root of gap².
- **Work bound.** `wideFindings` first. Then the whole run, the real kinds and the 99 shuffles, under one `withWork` allowance: a run that would spend more is refused in words, never cut short with fewer shuffles. Ticket 2 measures the run at 24, 36 and 60 periods and 2 to 6 Metrics, and sets the cap of periods so that 6 Metrics over 60 periods of values to the cent fit in a third of `WORK_BUDGET`, as the fit does.
- **A widget does not pay twice.** The result is a pure function of its inputs, so it is kept under a key made of the Metric ids, the periods, each value's text and the count asked for. A redraw on the same values reuses it. A new value, a correction or a Metric hidden from the viewer gives another key, so a widget always shows what its live values give.
- **Who reads the kept results.** They are derived data that only the core reads, in the server's memory, never sent anywhere. A key is only met by someone whose own visible inputs make it.

### Visibility

- **All or nothing.** A Look-alike uses only Metrics the person may see. A widget with a Metric the viewer may not see is refused whole: "One of this widget's Metrics is not available to you." It is never worked out without that Metric, because the kinds of the others would then differ and say something about it, and never with it, because the kinds would carry its values.
- **What leaves the core.** A browser, a View Link or a Snapshot gets only the sentence, the strip (each period's kind number, or none) and the table of medians and words. Not the scaled series, the weights, the shuffles or the costs. The medians are values of Metrics on the widget, which the viewer may already see.
- **In time.** A Snapshot keeps the kinds of its moment; a View Link shows the live ones. Kinds can change as periods are added, and the widget says so ("kinds as of October 2026").

### The picker entry

In `method-picker.ts`, a new want, `alike`: "What looks alike?", after "What is usual?". The entry `look-alike`:

- **name** "Which months look alike?" (the Common Period's word, from the Metrics on the canvas);
- **sentence** "Puts the months into 2 to 4 kinds by how the Metrics stood in them, and says what marks each kind.";
- **technical** "Ward's method, checked against shuffles";
- **Slot** `metrics`: "Which Metrics should the months be compared on?" (many, 2 to 6);
- **setting** `kinds`: "How many kinds?" (whole, 2 to 4, default empty, hint "Leave empty and Ziffr picks the count whose kinds stand furthest apart.");
- **checks** `lookAlike`, a new `MethodId` with periods, vary, gaps, mixed, too-many and the two cautions;
- **widget** `look-alike`.

Greyed, with its reason in the person's Metric names: "needs 24 months in common; Returns and Revenue have 17", "pick at least two Metrics", "at most 4 Metrics for 24 months", "Churn rate has Aggregation none and is weekly".

The Methods guide entry **Which periods look alike (Ward's method)**, read word for word by the picker through `method-picker-texts.json`:

- **Use it when** you want to see which months were like which across a few Metrics that matter together.
- **Don't use it when** you want to know why (it does not say); for one Metric alone (use What is usual?); for Metrics that wander slowly, such as a running total (it will mostly say "can't tell"); with more Metrics than you can give a reason for (each that has nothing to do with the kinds blurs them).

### The widget

As #1021 asks, the Look-alike widget recomputes on each draw from the live values through the core (reusing a kept result as above). It shows:

- the Takeaway, in the same words as on the canvas;
- a **strip**: one cell per period in time order, coloured by kind in the Theme's categorical colours in kind order, grey when it can't tell, the kind's words on hover and in the text version;
- the table of what marks each kind, under it.

It keeps its Metrics and the count by their ids. It counts against the page's allowance (`onPage`) only when it is worked out, not when a kept result is reused.

### The Analysis Recipe format

`ziffr.analysis/2` gets the function `lookAlike` and one new kind of step result.

- **`lookAlike`**: `of` and `with`, 2 to 4 Slots in all (the most a recipe has); `kinds` 2 to 4, optional.
- **kinds**, the new result: each period with its kind number, and each kind's words and medians.
- **Shown** as `takeaway`, as `table` (the medians and words), or by the new mark `strip`. Any other mark that names a kinds result is refused with "kinds are not amounts": a line through kind numbers would read 1, 2 and 3 as sizes.
- **Still `/2`:** a file that uses `lookAlike` must say `/2`, as for every function only `/2` has. Its Takeaway is the Method's own; a recipe adds only a title and a note.

### Where

`packages/core/src/methods/look-alike.ts` (pure), its words in `packages/core/src/takeaways/look-alike-takeaway.ts`, its run in `method-picker-run.ts`, the widget's view in `apps/web/src/views`, the `strip` mark in the renderer. Its row in the Calculation Catalogue is generated into `docs/reference/calculations.md`.

## User Stories

1. As a shop owner, I want to name Returns, Support tickets and Revenue and see which months were alike, so that I can look back at what those months had in common.
2. As them, I want each kind said in my Metrics' names, with its months as ranges, so that I do not have to read a chart to know what a kind is.
3. As them, I want to be told plainly when the months do not fall into clear kinds, so that I do not plan around a pattern that is only chance.
4. As anyone, I want the same values to give the same kinds today, tomorrow and on a colleague's screen, so that I can cite them.
5. As anyone, I want to pick how many kinds, or be told which count Ziffr picked and why, so that the number is never a hidden choice.
6. As someone with seasonal Metrics, I want a kind that keeps to the same time of year to be called so.
7. As anyone, I want the footer to say that this describes and does not explain, so that nobody reads a kind as a cause.
8. As an analyst, I want **Show the numbers** with the gaps, the shuffles, the counts per Metric and the medians, so that I can check the words.
9. As someone presenting, I want the result as a widget that updates with each new value and reads the same on a dashboard, a View Link and in a Snapshot.
10. As a viewer who may not see one of its Metrics, I want the widget refused whole, never worked out without it.
11. As a Pack author, I want `lookAlike` in a recipe without writing a sentence about statistics.

## Documentation

| For | Document | Written in |
| --- | --- | --- |
| People using Ziffr | `docs/user-guide/13-analyze.md` (the picker entry, how to read the kinds) and chapter 12 (the widget) | Tickets 5 and 6 |
| Anyone reading a Takeaway | `docs/guides/reading-a-takeaway.md`: what a kind is, why "can't tell" is a result, why it never says why | Ticket 4 |
| Analysts | `docs/guides/methods.md`: the entry above, how it is worked out, the measured table, the hand-worked case | Ticket 2, completed in 8 |
| Pack authors | `docs/guides/analysis-recipes.md` (`lookAlike`, the kinds result) and `docs/guides/view-designs.md` (the `strip` mark) | Ticket 7 |
| Everyone checking numbers | The Calculation Catalogue row, generated, never edited by hand | Ticket 1 |
| Contributors | Module headers naming **Look-alike**, a doc comment on every export, `GLOSSARY.md` | Every ticket |
| Releases | A changeset for what people notice | Tickets 5 to 8 |

## Testing Decisions

- **Hand-worked cases** (`look-alike.test.ts`): the 6-period case above, every cost as a fraction; a tie of costs decided by the earliest period; two kinds with no spread (an endless gap); a Metric read for its trend; the seasonal rule at 3/4 and one period less; period runs across a year end; the naming table at 1/2 and 4/5 and one step either side; two kinds with the same words.
- **An independent reference** (`test/reference/look-alike.ts`), written another way: the plain search over every pair at every step with each cost from explicit sums (not the nearest-kind shortcut), the pooled spread summed period by period, and SplitMix64 and Fisher–Yates from their published definitions. It must agree exactly: the same kinds, the same gap² fraction, the same c.
- **A Python reference on exact fractions** (`test/reference/fixtures/look-alike.py`, Python's `fractions`): 200 generated cases of 24 to 60 periods and 2 to 6 Metrics, with their kinds, gap² as a fraction, c and the Takeaway's case key, in `look-alike.json`, committed with the hash of the script that made it and generated outside CI. A test fails if the fixture was not made by the script's current version.
- **SciPy, for sanity,** in the same script: `scipy.cluster.hierarchy.linkage(method="ward")` on the scaled values must give the same kinds wherever no two costs lie within 1e-9 of each other (SciPy's tie order is not Ziffr's); a near tie is skipped and counted. Checked while writing this spec: on 6 generated cases of 24 periods and 2 to 4 Metrics, a prototype of the exact reference and SciPy gave the same kinds at all 18 counts, and gap² as a fraction equalled the doubles' to 15 digits.
- **Properties** (fast-check):
  - the same input gives the same result twice;
  - periods given in another order give the same kinds when no costs tie;
  - relabelling never changes the result: kinds are numbered by their earliest period, so every input gives kinds 1 to k in that order;
  - a positive factor or an added number on a Metric changes nothing; a turned sign changes no kind and swaps that Metric's "high" and "low";
  - the Metrics in another order give the same kinds and the same c;
  - the counts 2, 3 and 4 are nested, and every kind holds at least the minimum;
  - a refusal never carries a number, a "can't tell" result never names a kind, and a result with a caution is never strong.
- **Planted kinds are found**, through the real path at 2,000 runs: 2 Metrics, 24 months, 3 kinds set apart by 4 spreads: clear in at least 9 runs in 10 (measured 97 %); 4 Metrics, 24 months, months 10 to 12 three spreads higher on every Metric: at least 9 in 10 (measured 93 %); kinds of one Metric alone: clear in at most 1 in 10 (measured 4 to 6 %).
- **False claims on noise, the acceptance,** at 2,000 runs per case through the real, exact path (TypeScript, seeded), at 24, 36 and 60 periods and 2, 3, 4 and 6 Metrics:
  - independent bell-shaped, flat, skewed, heavy-tailed and counted values, and Metrics that only move together in a line: clear in **at most 5 %** of runs, each;
  - values that follow their own past (AR(1) 0.5): at most 10 %;
  - AR(1) 0.8 and running totals: measured and written in the Methods guide, no worse than this spec's tables (running totals of 4 Metrics over 60 periods: at most 21 %).
- **Mutation testing** (Stryker, `calculation-tests.md`) on `look-alike.ts` and its words, at the library's threshold.
- **Work bound:** the slowest case (6 Metrics, 60 periods, wide values) is refused in words within the allowance; values at more than 40 decimal places are refused before any arithmetic.
- **Visibility** (database suite): a widget of three Metrics drawn by someone who may see two is refused whole and says nothing about the third; a View Link carries only the sentence, the strip and the table; a Metric hidden after a draw makes the next draw refuse.
- **Words:** a table of cases for every sentence, caution, refusal and the footer; spec 0041's forbidden-word test, extended for this Takeaway with "cluster", "segment" and "group".
- **Reader trial** (spec 0041's, five people who have not studied statistics): each reads three Takeaways (clear kinds, can't tell, a seasonal kind) and says what they mean and what they would do. Anything two of five misread is reworded; above all, whether anyone reads a kind as a cause despite the footer. Kept in `docs/reviews/`.

## Tickets

Each is one pull request; blocked-by in brackets.

1. **The Method, exact.** `look-alike.ts`: the series, the basis per Metric, the scale, Ward with the tie rule, the counts, gap², Cliff's count, the seasonal rule, the period runs; the hand-worked cases; the TypeScript reference; the Calculation Catalogue row; glossary **Look-alike**. *Done when* the hand-worked fractions hold and the reference agrees exactly on 500 generated cases, and the properties pass.
2. **The shuffles, the bound and the simulation.** SplitMix64 and Fisher–Yates, c, the two bars, the slow-Metric rule; `withWork` and the cap of periods, measured; the false-claim and planted simulations at 2,000 runs. *Done when* every acceptance line of Testing Decisions holds and the measured table replaces this spec's. [1]
3. **The Python reference and the SciPy check.** The script, the fixture and its hash check, the comparison test. *Done when* the 200 cases agree exactly and the SciPy check passes, naming any near ties it skipped. [1]
4. **The Takeaway.** Words, the naming table, cautions, refusals, footer, the strength words in `strength.ts`, **Show the numbers**; the suitability checks for `lookAlike`; the forbidden-word test extended; `reading-a-takeaway.md`. *Done when* the table of cases passes in every language that exists. [2]
5. **The picker entry.** The want `alike`, the entry, the greyed reasons in the person's Metric names, the Methods guide entry and its texts, user guide chapter 13. *Done when* the picker's table of canvas states includes the entry and a Metric the person may not see is never offered in its Slot. [4]
6. **The widget and the `strip` mark.** The view, the strip, recomputing on each draw with the kept results, `onPage`, all or nothing, what a View Link and a Snapshot carry, user guide chapter 12. *Done when* the visibility and same-number tests pass, and in the running app the widget changes after a new value. [5]
7. **The recipe format.** `lookAlike` in `/2`, the kinds result, `strip` in View Designs, the refusal of other marks, the guides, the Playground. *Done when* a recipe with `lookAlike` is checked, drawn and exported in a Pack. [4, 6]
8. **Reader trial, mutation run and release note.** The five-person trial and rewording, the Stryker run, the Methods guide completed, the changeset. *Done when* the review is in `docs/reviews/` and nothing is misread by two of five. [6, 7]

## Out of Scope

- k-means, k-medoids and any method with a random start; more than 4 kinds.
- Kinds of Metrics (which Metrics behave alike) or of Breakdown rows.
- Kinds of the periods of one Metric alone: What is usual? and the change point answer that.
- Saying why months are alike, or tying a kind to an event. A person may write a Finding about it.
- Heads-ups about kinds ("this month looks like last December"): a follow-up once the false-claim rate has been seen on real Workspaces.
- Sending numbers to a language model. An assistant over MCP may read the Takeaway, as for every Analysis.
- Seasons of weeks.

## Decisions

Recommendations, accepted with this spec unless the owner objects in review.

1. **Ward's method, not k-means or k-medoids.** Ward is fixed by the values and one tie rule, its kinds for 2, 3 and 4 are nested (changing the count splits or joins, never reshuffles), and its costs are fractions. k-means needs a starting point: even a fixed farthest-point start can give other kinds after a small change in one value, and its answer is only the best near that start. k-medoids (PAM) is fixed too, but its swaps can run long, its kinds for 3 and 4 are not nested, and its usual distance needs square roots. Average linkage needs the distance itself, not its square: square roots again.
2. **Values on their own scale, not changes and not ranks.** Changes answer another question ("months in which returns rose"). Ranks would erase the gap between kinds inside each Metric (a Metric with two levels becomes evenly spaced ranks), and the shuffles already protect against skew and ties, which is what ranks would have been for. Trending Metrics are read for their trend, as everywhere.
3. **The shuffles as the chance check, with the gap and a floor of 3.** Two other checks were tried for this spec and dropped. A fixed table of silhouettes from bell-curve noise called kinds in 30 % of runs of skewed values and in 20 to 75 % of runs of counts. Shifting each Metric in time instead of shuffling it kept a shared yearly pattern in every shifted copy, so it missed the kinds that matter most. The gap, unlike the silhouette, is not fooled by Metrics that move together in a line, and "at least 3" says "further apart than a bell curve cut in two".
4. **The count** is the person's, or the largest gap among 2, 3 and 4, and the sentence says which ("Ziffr picked 3, where the kinds stand furthest apart").
5. **Kinds of one Metric alone are not called clear,** and the Takeaway points to What is usual?: the question is about months across Metrics.
6. **Slow Metrics ask for more (1 in 100),** carry a caution and are never strong. Without the rule, running totals were called clear in 12 to 44 % of runs; with it, 6 to 21 % (the second table above). A stricter bar would need more than 99 shuffles, and more work, for a case the Methods guide already steers away from.
7. **All or nothing for visibility,** and results kept by a key made of the inputs, so that a widget always shows its live values and never a stored result.
8. **The cap of 60 periods** for every Period in the first release (five years of months, but only 60 weeks): the shuffles multiply the work by 100. Raised for weeks and days only if ticket 2's measurement leaves room.

## Open questions

1. **Smooth yearly waves.** A Metric with a smooth wave over the year and little noise counts as changing slowly, and the months of a wave are a circle more than kinds, so it is mostly "can't tell" (0 to 2 % in the table). Recommended: keep it so, and say in the Methods guide that such Metrics are read better with What is usual? by month; the alternative, reading the place in the season as a kind of its own, would call every seasonal Metric's months "alike" by definition.
2. **How long a widget's kinds may stand.** Kinds can change when one new month comes in. Recommended: the widget says "kinds as of October 2026" and nothing more; the alternative, telling the people who see the widget when its kinds changed, would be a Heads-up kind of its own and belongs with the follow-up in Out of Scope.
