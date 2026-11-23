# Produces fit.json: what NumPy and SciPy say about the multiple fit (spec 0041, ticket 4): the Student t curve's quantiles, the
# least-squares fit of textbook and seeded datasets (Anscombe's four, a Longley-style set whose GNP and Population are nearly one
# Metric, an exact linear relation, random ones with 1 to 6 drivers), each effect with its 80 % range, the share each driver
# explains by averaging over every order of adding them (LMG, by brute force over all permutations), the variance inflation,
# the partial correlations, a value read from the fit with its range, and the driver value that reaches a goal with its range
# (found by SciPy's `brentq` on the band's edge).
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/fit.py
# fit.test.ts and distributions.test.ts fail when the "script" hash in the fixture is not the hash of this file, so edit this
# file => rerun it. statsmodels and R are not used: the formulas are written out below from the textbooks.
import hashlib
import itertools
import json
import math
import pathlib

import numpy as np
import scipy
from scipy import optimize, stats

here = pathlib.Path(__file__).parent
VERSION = 1
rng = np.random.default_rng(697)
LEVEL = 0.9  # the 90 % point of the t curve is the half width of an 80 % range

# ---- the t curve ----
quantiles = []
for df in list(range(1, 31)) + [40, 50, 60, 80, 100, 120, 200, 500, 1000, 10000]:
    for p in (0.8, 0.9, 0.95, 0.975, 0.99, 0.995):
        quantiles.append({"df": df, "p": p, "t": float(stats.t.ppf(p, df))})


# ---- fits ----
def lmg(X, y):
    k = X.shape[1]
    sst = float(((y - y.mean()) ** 2).sum())

    def r2(cols):
        if not cols:
            return 0.0
        d = np.column_stack([np.ones(len(y)), X[:, list(cols)]])
        b, *_ = np.linalg.lstsq(d, y, rcond=None)
        return 1.0 - float(((y - d @ b) ** 2).sum()) / sst

    share = np.zeros(k)
    perms = list(itertools.permutations(range(k)))
    for order in perms:
        have = []
        for j in order:
            share[j] += r2(have + [j]) - r2(have)
            have.append(j)
    return (share / len(perms)).tolist()


def fit_of(name, names, y, X, point=None, goal_driver=None):
    n, k = X.shape
    d = np.column_stack([np.ones(n), X])
    beta, *_ = np.linalg.lstsq(d, y, rcond=None)
    resid = y - d @ beta
    sse = float(resid @ resid)
    sst = float(((y - y.mean()) ** 2).sum())
    df = n - k - 1
    sigma2 = sse / df
    inv = np.linalg.inv(d.T @ d)
    t = float(stats.t.ppf(LEVEL, df))
    se = np.sqrt(sigma2 * np.diag(inv))[1:]
    corr = np.corrcoef(X, rowvar=False).reshape(k, k) if k > 1 else np.ones((1, 1))
    vif = np.diag(np.linalg.inv(corr)).tolist() if k > 1 else [1.0]
    # The partial correlation of each driver with the target, from its t statistic: r = t / sqrt(t^2 + df).
    tstat = beta[1:] / se
    partial = (tstat / np.sqrt(tstat**2 + df)).tolist()
    shares = lmg(X, y)
    entry = {
        "name": name,
        "names": names,
        "y": [float(v) for v in y],
        "x": [[float(v) for v in X[:, j]] for j in range(k)],
        "n": n,
        "df": df,
        "t": t,
        "intercept": float(beta[0]),
        "effects": [float(v) for v in beta[1:]],
        "se": [float(v) for v in se],
        "lo": [float(b - t * s) for b, s in zip(beta[1:], se)],
        "hi": [float(b + t * s) for b, s in zip(beta[1:], se)],
        "sse": sse,
        "explained": 1.0 - sse / sst,
        "miss": math.sqrt(sigma2),
        "vif": vif,
        "partial": partial,
        "explains": shares,
        "share": [s / sum(shares) for s in shares],
    }
    # A value read from the fit: the mean of each driver moved by half a spread, and its 80 % range for a single period.
    x0 = X.mean(axis=0) + 0.5 * X.std(axis=0, ddof=1)
    row = np.concatenate([[1.0], x0])
    h = float(row @ inv @ row)
    value = float(row @ beta)
    half = t * math.sqrt(sigma2 * (1 + h))
    entry["predict"] = {"values": [float(v) for v in x0], "value": value, "lo": value - half, "hi": value + half}
    if goal_driver is not None:
        # The driver value that reaches a goal with the others at their latest values, and the values whose range holds the goal.
        j = goal_driver
        held = X[-1].copy()
        goal = float(value + 0.25 * math.sqrt(sigma2) * 3)

        def at(xj):
            r = np.concatenate([[1.0], np.where(np.arange(k) == j, xj, held)])
            return float(r @ beta), float(r @ inv @ r)

        def band(xj):
            v, hh = at(xj)
            return abs(goal - v) - t * math.sqrt(sigma2 * (1 + hh))

        base = float(held[j])
        others = float(np.concatenate([[1.0], np.where(np.arange(k) == j, 0.0, held)]) @ beta)
        star = (goal - others) / float(beta[1 + j])
        scale = float(X[:, j].std(ddof=1))
        lo = hi = None
        if float(beta[1 + j]) ** 2 > t * t * sigma2 * inv[1 + j, 1 + j]:
            lo = optimize.brentq(band, star - 1e6 * scale, star, xtol=1e-14, rtol=1e-14, maxiter=500)
            hi = optimize.brentq(band, star, star + 1e6 * scale, xtol=1e-14, rtol=1e-14, maxiter=500)
        entry["needs"] = {"goal": goal, "driver": j, "held": [float(v) for v in held], "value": float(star), "lo": lo, "hi": hi, "current": base}
    return entry


def rounded(a):
    return np.array([round(float(v), 2) for v in a])


fits = []
# Anscombe's quartet: the same fit four times over very different data (intercept 3.0, effect 0.5, R^2 0.667).
anscombe_x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
anscombe = {
    "anscombe-1": (anscombe_x, [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]),
    "anscombe-2": (anscombe_x, [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74]),
    "anscombe-3": (anscombe_x, [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73]),
    "anscombe-4": ([8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8], [6.58, 5.76, 7.71, 8.84, 8.47, 7.04, 5.25, 12.50, 5.56, 7.91, 6.89]),
}
for name, (x, y) in anscombe.items():
    fits.append(fit_of(name, ["X"], np.array(y), np.array(x, dtype=float).reshape(-1, 1), goal_driver=0))

# A Longley-style set (16 years, 1947 to 1962): the economy's numbers that grow together.
longley = {
    "deflator": [83, 88.5, 88.2, 89.5, 96.2, 98.1, 99, 100, 101.2, 104.6, 108.4, 110.8, 112.6, 114.2, 115.7, 116.9],
    "gnp": [234.289, 259.426, 258.054, 284.599, 328.975, 346.999, 365.385, 363.112, 397.469, 419.18, 442.769, 444.546, 482.704, 502.601, 518.173, 554.894],
    "unemployed": [235.6, 232.5, 368.2, 335.1, 209.9, 193.2, 187, 357.8, 290.4, 282.2, 293.6, 468.1, 381.3, 393.1, 480.6, 400.7],
    "armed": [159, 145.6, 161.6, 165, 309.9, 359.4, 354.7, 335, 304.8, 285.7, 279.8, 263.7, 255.2, 251.4, 257.2, 282.7],
    "population": [107.608, 108.632, 109.773, 110.929, 112.075, 113.27, 115.094, 116.219, 117.388, 118.734, 120.445, 121.95, 123.366, 125.368, 127.852, 130.081],
    "employed": [60.323, 61.122, 60.171, 61.187, 63.221, 63.639, 64.989, 63.761, 66.019, 67.857, 68.169, 66.513, 68.655, 69.564, 69.331, 70.551],
}
cols = lambda *ks: np.column_stack([np.array(longley[k], dtype=float) for k in ks])
fits.append(fit_of("longley-benign", ["Unemployed", "Armed forces"], np.array(longley["employed"]), cols("unemployed", "armed"), goal_driver=0))
# GNP and Population are nearly one Metric: the fit on both has a huge variance inflation (the Takeaway treats them as one).
fits.append(fit_of("longley-collinear", ["GNP", "Population"], np.array(longley["employed"]), cols("gnp", "population")))
fits.append(fit_of("longley-one", ["GNP"], np.array(longley["employed"]), cols("gnp"), goal_driver=0))

# An exact linear relation: the effects come out as written, with no miss at all.
x = np.column_stack([np.round(rng.uniform(0, 100, 24), 1), np.round(rng.uniform(0, 50, 24), 1), np.round(rng.uniform(-20, 20, 24), 1)])
fits.append(fit_of("exact-linear", ["A", "B", "C"], rounded(5 + 2 * x[:, 0] - 3 * x[:, 1] + 0.5 * x[:, 2]), x, goal_driver=1))

# Random ones: n and the number of drivers as the minimum allows, and well above it.
for name, n, k in [("random-1-driver", 12, 1), ("random-2-drivers", 16, 2), ("random-3-drivers", 24, 3), ("random-4-drivers", 40, 4), ("random-6-drivers", 36, 6)]:
    X = np.column_stack([rounded(rng.normal(50 * (j + 1), 8 + 3 * j, n)) for j in range(k)])
    coef = rng.uniform(-3, 3, k)
    y = rounded(10 + X @ coef + rng.normal(0, 6, n))
    fits.append(fit_of(name, [chr(65 + j) for j in range(k)], y, X, goal_driver=0))

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "fit.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "quantiles": quantiles,
    "fits": fits,
}
(here / "fit.json").write_text(json.dumps(out, indent=1) + "\n")
