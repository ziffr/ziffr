# Produces before-after.json: what SciPy and NumPy say about the Methods of spec 0041, ticket 7: Student's t curve (scipy.stats.t
# `ppf` and `cdf`), before and after (`afterDate`: the straight line through the values before a date by NumPy least squares,
# cross-checked with scipy.stats.linregress and, on Anscombe's first set, with the textbook line y = 3.0001 + 0.5001 x; the gap to
# it and the 80 % range of the mean of the values after, from the covariance matrix of the fit, s² · (X'X)⁻¹, and scipy's t quantile)
# and the change point (every date with 4 values each side tried, two lines by `numpy.polyfit`, the F ratio with (2, n - 4) degrees of
# freedom and its chance scipy.stats.f.sf, which is checked here against the closed form (SSE₀ ÷ SSE₁)^(-(n - 4)/2) the code uses).
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/before-after.py
# before-after.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import pathlib

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
rng = np.random.default_rng(20417)


def two(v):
    """Values written to two decimals, so that the text is exact."""
    return [round(float(x), 2) for x in v]


# ---- Student's t curve ----
t_dfs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 50, 100, 500, 2000]
t_ps = [0.001, 0.01, 0.05, 0.1, 0.25, 0.4, 0.5, 0.55, 0.6, 0.75, 0.8, 0.9, 0.95, 0.975, 0.99, 0.995, 0.999]
t_ppf = [{"p": p, "df": df, "t": float(stats.t.ppf(p, df))} for df in t_dfs for p in t_ps]
t_grid = [-60.0, -20.0, -8.0, -3.5, -2.0, -1.0, -0.25, 0.0, 0.25, 1.0, 2.0, 3.5, 8.0, 20.0, 60.0]
t_cdf = [{"t": t, "df": df, "p": float(stats.t.cdf(t, df))} for df in t_dfs for t in t_grid]
# The 80 % range's point for every number of degrees of freedom the Methods use (the line before a date has 4 or more).
t_80 = [{"df": df, "t": float(stats.t.ppf(0.9, df))} for df in range(1, 201)]


# ---- Before and after ----
def after_case(values, start):
    """`values` by month from January 2024 (None: no value); the periods from index `start` on are after the date."""
    x = [i for i, v in enumerate(values) if v is not None and i < start]
    y = [values[i] for i in x]
    xa = [i for i, v in enumerate(values) if v is not None and i >= start]
    ya = [values[i] for i in xa]
    n, m = len(x), len(xa)
    design = np.column_stack([np.ones(n), np.array(x, dtype=float)])
    beta = np.linalg.lstsq(design, np.array(y, dtype=float), rcond=None)[0]
    line = stats.linregress(x, y)
    assert abs(beta[1] - line.slope) <= 1e-9 * max(1.0, abs(line.slope)), "slope"
    assert abs(beta[0] - line.intercept) <= 1e-9 * max(1.0, abs(line.intercept)), "intercept"
    resid = np.array(y, dtype=float) - design @ beta
    sse = float(resid @ resid)
    s2 = sse / (n - 2)
    pred = beta[0] + beta[1] * np.array(xa, dtype=float)
    expected = float(pred.mean())
    gap = float(np.mean(ya)) - expected
    cov = s2 * np.linalg.inv(design.T @ design)
    c = np.array([1.0, float(np.mean(xa))])
    var = s2 / m + float(c @ cov @ c)
    half = float(stats.t.ppf(0.9, n - 2) * np.sqrt(var))
    out = {"values": values, "start": start, "n": n, "m": m, "slope": float(beta[1]), "intercept": float(beta[0]), "sse": sse,
           "spread": float(np.sqrt(s2)), "expected": expected, "actual": float(np.mean(ya)), "gap": gap, "half": half, "lo": gap - half, "hi": gap + half}
    out["share"] = None if expected <= 0 else {"gap": 100 * gap / expected, "lo": 100 * (gap - half) / expected, "hi": 100 * (gap + half) / expected}
    return out


anscombe_x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
anscombe_y1 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
# Anscombe's first set on x = 4 to 14 (as 4 to 14 months from January 2024; months 0 to 3 have no value), with months 16 to 18 after the date.
by_x = dict(zip(anscombe_x, anscombe_y1))
anscombe_values = [None] * 4 + [by_x[x] for x in range(4, 15)] + [None, 9.5, 10.1, 10.4]
anscombe = after_case(anscombe_values, 16)
assert abs(anscombe["slope"] - 0.5001) < 1e-4 and abs(anscombe["intercept"] - 3.0001) < 1e-4 and abs(anscombe["sse"] - 13.7627) < 1e-3, "Anscombe"


def trending(n, slope, level, sd, shift=0.0, start=None):
    base = [level + slope * i + (shift if start is not None and i >= start else 0.0) + rng.normal(0, sd) for i in range(n)]
    return two(base)


after_cases = {
    "anscombe-1": anscombe,
    "planted-rise": after_case(trending(24, 10, 1000, 20, 150, 12), 12),
    "planted-fall": after_case(trending(20, 5, 300, 8, -60, 12), 12),
    "no-change": after_case(trending(24, 4, 500, 15), 14),
    "flat-before": after_case(trending(18, 0, 200, 6, 25, 10), 10),
    "falling-trend-below-zero": after_case(trending(18, -30, 120, 5, -10, 12), 12),
    "negative-values": after_case(trending(20, 2, -500, 9, 30, 11), 11),
    "short-before": after_case(trending(10, 3, 80, 2, 12, 6), 6),
    "one-after": after_case(trending(15, 3, 80, 2, 15, 14), 14),
    "long": after_case(trending(60, 1.5, 400, 12, 40, 36), 36),
    "tiny-values": after_case(two(rng.normal(0.5, 0.05, 16)), 10),
}
# Gaps: periods without a value before and after the date are left out, never filled in.
gappy = trending(26, 6, 300, 9, 70, 14)
for i in (2, 5, 9, 17, 20):
    gappy[i] = None
after_cases["with-gaps"] = after_case(gappy, 14)
perfect = [100.0 + 5 * i for i in range(12)] + [200.0 + 5 * i for i in range(12, 16)]
after_cases["perfect-line-before"] = after_case(perfect, 12)


# ---- The change point ----
def change_case(values):
    y = np.array(values, dtype=float)
    n = len(y)
    x = np.arange(n, dtype=float)
    segment = 4
    tries = n - 2 * segment + 1
    best = None
    for k in range(segment, n - segment + 1):
        sse = 0.0
        for a, b in ((0, k), (k, n)):
            coef = np.polyfit(x[a:b], y[a:b], 1)
            r = y[a:b] - np.polyval(coef, x[a:b])
            sse += float(r @ r)
        if best is None or sse < best[1] - 1e-9 * max(1.0, best[1]):
            best = (k, sse)
    k, sse1 = best
    one = np.polyfit(x, y, 1)
    sse0 = float(((y - np.polyval(one, x)) ** 2).sum())
    left = np.polyfit(x[:k], y[:k], 1)
    right = np.polyfit(x[k:], y[k:], 1)
    step = float(np.polyval(right, x[k]) - np.polyval(left, x[k]))
    d = n - 4
    out = {"values": values, "n": n, "tries": tries, "index": k, "sse0": sse0, "sse1": sse1, "before": float(left[0]), "after": float(right[0]), "step": step}
    if sse1 > 1e-9 and sse0 > 1e-9:
        f = ((sse0 - sse1) / 2) / (sse1 / d)
        p = float(stats.f.sf(f, 2, d))
        closed = (sse0 / sse1) ** (-d / 2)
        assert abs(p - closed) <= 1e-9 * max(p, 1e-300), ("closed form", p, closed)
        bar = 0.05 / tries
        out.update({"f": float(f), "p": p, "bar": bar, "ratio": p / bar, "found": bool(p < bar)})
        sxx = lambda a, b: float(((x[a:b] - x[a:b].mean()) ** 2).sum())
        out["slopeHalf"] = float(stats.t.ppf(0.9, d) * np.sqrt(sse1 / d * (1 / sxx(0, k) + 1 / sxx(k, n))))
        out["kept"] = sse1 / sse0
    else:
        out.update({"found": bool(sse0 > 1e-9 and sse1 <= 1e-9), "p": None})
    return out


def wiggle(n, amplitude):
    return [amplitude * float(rng.normal(0, 1)) for _ in range(n)]


def shaped(n, k, before, after, jump, level, sd):
    noise = wiggle(n, sd)
    return two([level + (before * i if i < k else before * k + jump + after * (i - k)) + noise[i] for i in range(n)])


change_cases = {
    "level-step": change_case(shaped(30, 15, 2.0, 2.0, 60.0, 500, 6)),
    "turn-around": change_case(shaped(30, 15, 12.0, -8.0, 0.0, 100, 5)),
    "speeds-up": change_case(shaped(28, 18, 1.0, 9.0, 0.0, 200, 4)),
    "noise-only": change_case(two(100 + np.array(wiggle(30, 8)))),
    "line-and-noise": change_case(two(100 + 3 * np.arange(30) + np.array(wiggle(30, 6)))),
    "at-the-minimum": change_case(two([10, 12, 11, 13, 40, 42, 41, 43])),
    "eight-noise": change_case(two([10, 14, 9, 15, 11, 13, 12, 10])),
    "perfect-two-lines": change_case([float(i) for i in range(10)] + [10.0 - 3 * i for i in range(1, 11)]),
    "perfect-line": change_case([5.0 + 2 * i for i in range(20)]),
}
# Series with no value in some periods: the position of a value is its place in the calendar, so a gap is a longer step.
gapped = shaped(32, 16, 3.0, -2.0, 20.0, 300, 4)
gapped_pos = [i for i in range(32) if i not in (3, 11, 20, 25)]
gv = [gapped[i] for i in gapped_pos]
gx = np.array(gapped_pos, dtype=float)


def change_gapped():
    n = len(gv)
    y = np.array(gv)
    segment, tries = 4, n - 7
    best = None
    for k in range(segment, n - segment + 1):
        sse = 0.0
        for a, b in ((0, k), (k, n)):
            coef = np.polyfit(gx[a:b], y[a:b], 1)
            r = y[a:b] - np.polyval(coef, gx[a:b])
            sse += float(r @ r)
        if best is None or sse < best[1] - 1e-9 * max(1.0, best[1]):
            best = (k, sse)
    k, sse1 = best
    one = np.polyfit(gx, y, 1)
    sse0 = float(((y - np.polyval(one, gx)) ** 2).sum())
    left, right = np.polyfit(gx[:k], y[:k], 1), np.polyfit(gx[k:], y[k:], 1)
    d = n - 4
    f = ((sse0 - sse1) / 2) / (sse1 / d)
    p = float(stats.f.sf(f, 2, d))
    return {"positions": gapped_pos, "values": gv, "n": n, "tries": tries, "index": k, "sse0": sse0, "sse1": sse1, "before": float(left[0]), "after": float(right[0]),
            "step": float(np.polyval(right, gx[k]) - np.polyval(left, gx[k])), "p": p, "bar": 0.05 / tries, "ratio": p / (0.05 / tries), "found": bool(p < 0.05 / tries)}


change_cases["with-gaps"] = change_gapped()

# Two series that differ only in how loud the noise is, straddling the bar: the chance rule's boundary, one just under and one just over.
base_noise = wiggle(24, 1.0)


def amplitude_series(a):
    return two([100 + 2 * i + (45 if i >= 12 else 0) + a * base_noise[i] for i in range(24)])


def ratio_at(a):
    c = change_case(amplitude_series(a))
    return c["ratio"]


lo_a, hi_a = 1.0, 400.0
for _ in range(200):
    mid = (lo_a + hi_a) / 2
    if ratio_at(mid) < 1:
        lo_a = mid
    else:
        hi_a = mid
under = change_case(amplitude_series(lo_a * 0.995))
over = change_case(amplitude_series(hi_a * 1.005))
assert under["found"] and not over["found"] and 0.5 < under["ratio"] < 1 < over["ratio"] < 2, (under["ratio"], over["ratio"])
change_cases["just-found"] = under
change_cases["just-not-found"] = over

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "before-after.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "tPpf": t_ppf,
    "tCdf": t_cdf,
    "t80": t_80,
    "after": after_cases,
    "change": change_cases,
}
(here / "before-after.json").write_text(json.dumps(out, indent=1) + "\n")
