# Quantile

**Rule:** the p-quantile of a series is the value at position (n − 1) · p among its n sorted values, counted from 0, or between the two values around that position in proportion (Hyndman and Fan's type 7, the default of NumPy and R). It is worked out exactly on the values' text, and only the last step is a double, the one nearest to the exact result: the middle of 0.1 and 0.2 is 0.15, not 0.15000000000000002.

**Assumes:** nothing about the shape of the values. Each value counts once, and the order they were given in does not matter.

**Minimum data:** two values that are not all the same. A value that is not a number is refused, never dropped or mended, and so is a share outside 0 to 1. It is checked on up to 120 values.

**Do not use it** to say what is normal for a Metric that has a trend or a step in level: its history is not one population, and the usual range checks that before it uses a quantile. A series of one value or of values that are all the same has no spread for a share to be placed in; Ziffr's own usual range still answers for those, since it is the same value.
