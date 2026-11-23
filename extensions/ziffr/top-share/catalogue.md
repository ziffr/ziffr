# Share of the largest rows

**Rule:** the n largest rows' part of the whole, worked out exactly on the rows' text: each row is read as digits, the sums are whole numbers, and only the last step is a double, the one nearest to the exact result. It gives the share (0 to 1) and in percent, each named row's own share, the whole, and whether a row of the size of the last one named was left out (then which of those rows is named is arbitrary; the count is not). Rows of the same size keep the order they were given in.

**Assumes:** the rows are the parts of one whole that adds up, such as revenue by customer. It cannot know that they are: a share of averages, percentages or rates means nothing.

**Minimum data:** at least two rows, none below zero or not a number, that do not all add up to nothing; n a whole number from 1 to one fewer than the rows (all of them is the whole and says nothing). A row is never dropped or mended. It is checked on up to 120 rows.

**Do not use it** on rows that are not parts of one whole, or to say how few rows make most of it: the Pareto answers that, with a share asked for instead of a count.
