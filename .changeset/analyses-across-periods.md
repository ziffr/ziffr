---
"@ziffr/web": minor
---

Correlation, Drivers, the correlation matrix and a Metric's Correlation now compare Metrics of different periods, such as weekly support tickets with monthly churn: the shorter one is combined to the longer by its Aggregation, and the result says "Compared by month (18 months)". A Metric whose Aggregation is none stays with its own period, and the result says why it is missing.
