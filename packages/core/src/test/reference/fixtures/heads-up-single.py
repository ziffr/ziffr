# Produces heads-up-single.json: what Python says about the chances behind the Heads-ups about one Metric (spec 0041, ticket 15), written
# a third way, apart from the code under test (methods/heads-up-single.ts, t-curve.ts, change-point.ts) and from the TypeScript reference
# (test/reference/heads-up-single.ts):
#   - a straight line through the latest values read at a later period: NumPy's np.polyfit for the line, and the chance that its value is
#     as far below (or above) a bound as it is from SciPy's Student t (scipy.stats.t.cdf) with n - 2 degrees of freedom, on the standard
#     error of the line's value sqrt(s2 * (1/n + (x0 - xbar)^2 / Sxx));
#   - the same Target read from the changes alone (the check that a series that wanders, a running total, must also pass: its changes are independent
#     where a line's misses are not): the mean change per period over the values, against what it takes to reach the bound at that period from the
#     last value, (bound - last) / periods ahead; Student's t with (changes - 1) degrees of freedom on the standard error of the mean change
#     (scipy.stats.t.cdf), one-sided, the same way for a lower bound and an upper bound;
#   - a new value against earlier values at the same place in the season: the two-sided chance from scipy.stats.t.sf at
#     |latest - mean| / (s * sqrt(1 + 1/k)) with k - 1 degrees of freedom;
#   - the chance that the mean change per period differs before and after a date (the check that the Heads-up of a change of direction adds to the
#     change point's own chance, which a series that wanders, a running total, can pass): scipy.stats.ttest_ind (pooled variance) of the changes
#     from period to period after the date against those before it, the change that spans the date left out;
#   - the chance of a change point by luck: every date that leaves at least 4 values each side tried with np.linalg.lstsq on each side, the
#     best by the smallest sum of squared misses, and the chance from scipy.stats.f.sf at ((SSE0 - SSE1) / 2) / (SSE1 / (n - 4)) with 2 and
#     n - 4 degrees of freedom, times the dates tried (at most 1): the closed form the code uses, (SSE1 / SSE0)^((n - 4) / 2), is its
#     value for 2 degrees of freedom in the numerator.
# Values are written with two decimals, so the text the code reads is the number Python used. Run offline (CI needs neither):
#   python3 packages/core/src/test/reference/fixtures/heads-up-single.py
# heads-up-single.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import pathlib

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
SEGMENT = 4


def two(values):
    return [round(float(v), 2) for v in values]


def line_case(values, at, bound):
    n = len(values)
    x = np.arange(n, dtype=float)
    y = np.asarray(values, float)
    slope, intercept = np.polyfit(x, y, 1)
    resid = y - (intercept + slope * x)
    sse = float(resid @ resid)
    s2 = sse / (n - 2)
    sxx = float(((x - x.mean()) ** 2).sum())
    yhat = float(intercept + slope * at)
    var = s2 * (1 / n + (at - x.mean()) ** 2 / sxx)
    out = {"values": values, "at": at, "bound": bound, "yhat": yhat, "var": var, "n": n}
    d = np.diff(y)
    m = len(d)
    h = at - (n - 1)
    needed = (bound - float(y[-1])) / h
    if float(np.ptp(d)) == 0:
        out["driftBelow"] = 0.0 if d[0] < needed else 1.0
        out["driftAbove"] = 0.0 if needed < d[0] else 1.0
    else:
        se = float(d.std(ddof=1)) / np.sqrt(m)
        out["driftBelow"] = float(stats.t.cdf((float(d.mean()) - needed) / se, m - 1))
        out["driftAbove"] = float(stats.t.cdf((needed - float(d.mean())) / se, m - 1))
    if var == 0:
        out["below"] = 0.0 if yhat < bound else 1.0
        out["above"] = 0.0 if yhat > bound else 1.0
    else:
        se = float(np.sqrt(var))
        out["below"] = float(stats.t.cdf((yhat - bound) / se, n - 2))
        out["above"] = float(stats.t.cdf((bound - yhat) / se, n - 2))
    return out


def fresh_case(earlier, latest):
    k = len(earlier)
    e = np.asarray(earlier, float)
    s = float(e.std(ddof=1))
    if s == 0:
        return {"earlier": earlier, "latest": latest, "p": 1.0}
    t = abs(latest - float(e.mean())) / (s * np.sqrt(1 + 1 / k))
    return {"earlier": earlier, "latest": latest, "p": float(min(1.0, 2 * stats.t.sf(t, k - 1)))}


def sse_of(y):
    x = np.arange(len(y), dtype=float)
    coef, *_ = np.linalg.lstsq(np.vstack([x, np.ones(len(y))]).T, np.asarray(y, float), rcond=None)
    r = np.asarray(y, float) - (coef[0] * x + coef[1])
    return float(r @ r)


def change_case(values):
    n = len(values)
    tries = n - 2 * SEGMENT + 1
    best = None
    for k in range(SEGMENT, n - SEGMENT + 1):
        sse = sse_of(values[:k]) + sse_of(values[k:])
        if best is None or sse < best[1] - 1e-12 * max(1.0, abs(best[1])):
            best = (k, sse)
    k, sse1 = best
    sse0 = sse_of(values)
    f = ((sse0 - sse1) / 2) / (sse1 / (n - 4))
    p = float(min(1.0, tries * stats.f.sf(f, 2, n - 4)))
    d = np.diff(np.asarray(values, float))
    # The change into period j is d[j - 1]: those into periods 1..k-1 are before the date, those into k+1..n-1 after it.
    shift = float(stats.ttest_ind(d[k:], d[: k - 1], equal_var=True).pvalue)
    constant = np.ptp(d[k:]) == 0 and np.ptp(d[: k - 1]) == 0
    if constant:
        shift = 0.0 if d[k] != d[0] else 1.0
    return {"values": values, "n": n, "tries": tries, "index": k, "sse0": sse0, "sse1": sse1, "p": p, "shift": shift}


rs = np.random.RandomState(20261123)
lines = []
for n in (8, 9, 12, 16, 24):
    for kind in ("trend", "noise", "walk", "falling"):
        if kind == "trend":
            v = 100 + 3.0 * np.arange(n) + rs.normal(0, 4, n)
        elif kind == "noise":
            v = 100 + rs.normal(0, 10, n)
        elif kind == "walk":
            v = 100 + np.cumsum(rs.normal(0, 5, n))
        else:
            v = 1000 - 15.0 * np.arange(n) + rs.normal(0, 3, n)
        values = two(v)
        for ahead in (1, 3, 12):
            at = n - 1 + ahead
            lines.append(line_case(values, at, round(float(np.mean(values)), 2)))
            lines.append(line_case(values, at, round(float(values[-1]) + 25, 2)))
# A perfect line: no miss, so the line's value is exact.
lines.append(line_case([10.0 + 2 * i for i in range(10)], 12, 40.0))
lines.append(line_case([10.0 + 2 * i for i in range(10)], 12, 20.0))

fresh = []
for k in (2, 3, 4, 5, 8, 10):
    for kind in range(4):
        e = two(100 + rs.normal(0, 8, k))
        latest = round(float(np.mean(e) + (0.5, 2.0, 4.0, -6.0)[kind] * np.std(e, ddof=1)), 2)
        fresh.append(fresh_case(e, latest))
fresh.append(fresh_case([100.0, 100.0, 100.0], 120.0))
fresh.append(fresh_case([100.0, 110.0], 100.0))

changes = []
for n in (8, 9, 10, 12, 16, 24, 36):
    for shape in ("noise", "turn", "step", "line"):
        x = np.arange(n)
        if shape == "noise":
            v = 100 + rs.normal(0, 10, n)
        elif shape == "turn":
            cut = max(SEGMENT, n - 5)
            v = np.where(x < cut, 20.0 * x, 20.0 * cut - 12.0 * (x - cut)) + rs.normal(0, 3, n)
        elif shape == "step":
            v = 100 + 3 * x + np.where(x >= n // 2, 40.0, 0.0) + rs.normal(0, 4, n)
        else:
            v = 50 + 2.5 * x + rs.normal(0, 1.5, n)
        changes.append(change_case(two(v)))

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "heads-up-single.py").read_bytes()).hexdigest(),
    "tools": {"python": "3", "numpy": np.__version__, "scipy": scipy.__version__},
    "lines": lines,
    "fresh": fresh,
    "changes": changes,
}
(here / "heads-up-single.json").write_text(json.dumps(out, indent=1) + "\n")
print(f"{len(lines)} lines, {len(fresh)} fresh values, {len(changes)} change points")
