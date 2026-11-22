---
"@ziffr/web": minor
---

Ziffr can now work out three more kinds of link between Metrics, and three kinds of plain sums over a Breakdown. Rank correlation says whether two Metrics rise and fall together by the order of their values, which suits skewed values. Partial correlation says whether two Metrics still move together with one to four others held the same. Lagged correlation says whether one Metric tends to move up to six periods before another, and counts the delays it looked at so the best of them is not read as stronger than it is. The usual range says what is normal for a Metric by its own history, by season where it has one. The share of the largest rows, the Pareto (the fewest rows that make 80 %) and the bridge (what each part contributed to a change) are worked out exactly and say so. Each refuses in words when there is too little to go on, and none changes a value. They are described in the Methods guide.
