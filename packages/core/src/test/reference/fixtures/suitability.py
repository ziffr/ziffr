# Produces suitability.json: what SciPy and NumPy say about the quantities the suitability checks decide on (skewness,
# median and median absolute deviation, Spearman's rank correlation, the normal curve's 97.5 % point, the exact runs
# test by counting every arrangement, the step in level fitted by least squares, the yearly pattern's difference).
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/suitability.py
# suitability.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import itertools
import json
import pathlib

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
rng = np.random.default_rng(2026)

lists = {
    "anscombe-1-y": [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68],
    "anscombe-4-x": [8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8],
    "right-skew": [1, 1, 2, 2, 2, 3, 3, 4, 5, 60],
    "left-skew": [-60, -5, -4, -3, -3, -2, -2, -2, -1, -1],
    "symmetric": [1, 2, 3, 4, 5, 6, 7],
    "ties": [1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
    "normal": [round(float(v), 2) for v in rng.normal(100, 5, 24)],
    "lognormal": [round(float(v), 2) for v in rng.lognormal(3, 1.2, 24)],
}
skew = {}
for name, v in lists.items():
    x = np.array(v, dtype=float)
    med = float(np.median(x))
    skew[name] = {
        "values": v,
        "skew": float(stats.skew(x)) if np.ptp(x) > 0 else None,
        "median": med,
        "mad": float(stats.median_abs_deviation(x, scale=1)),
    }

pairs = {
    "anscombe-1": ([10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5], [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]),
    "ties": ([1, 1, 2, 2, 3, 3, 4, 4], [1, 2, 2, 3, 3, 4, 4, 5]),
    "perfect-monotone": ([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]),
    "perfect-reverse": ([1, 2, 3, 4, 5], [9, 7, 5, 3, 1]),
    "level-and-miss": ([float(v) for v in range(1, 21)], [float(abs(v)) for v in rng.normal(0, 1, 20) * np.arange(1, 21)]),
}
spearman = {}
for name, (a, b) in pairs.items():
    rho = stats.spearmanr(a, b).statistic
    spearman[name] = {"a": a, "b": b, "rho": float(rho)}


def runs_of(signs):
    return 1 + sum(1 for i in range(1, len(signs)) if signs[i] != signs[i - 1])


def tail(n1, n2, r):
    # Every arrangement of n1 plus and n2 minus signs, by choosing the places of the plus signs.
    n = n1 + n2
    at_most = 0
    total = 0
    for plus in itertools.combinations(range(n), n1):
        signs = [False] * n
        for i in plus:
            signs[i] = True
        total += 1
        if runs_of(signs) <= r:
            at_most += 1
    return at_most, total


runs = []
for n1, n2 in [(1, 1), (2, 2), (3, 3), (4, 4), (5, 3), (6, 6), (7, 5), (8, 8), (9, 4), (10, 10)]:
    for r in range(2, n1 + n2 + 1):
        at_most, total = tail(n1, n2, r)
        runs.append({"n1": n1, "n2": n2, "runs": r, "atMost": at_most, "all": total})

# A step in level on a straight line: y = a + b t + c [t >= k] + noise (rounded to 2 places so the text is exact).
steps = []
for name, n, k, c, noise in [("clear-step", 16, 8, 12.0, 0.4), ("no-step", 16, 8, 0.0, 0.4), ("small-step", 20, 10, 1.0, 1.0), ("perfect-step", 12, 6, 5.0, 0.0), ("late-step", 18, 14, 9.0, 0.5)]:
    t = np.arange(n, dtype=float)
    y = np.array([round(float(v), 2) for v in 50 + 2.0 * t + c * (t >= k) + rng.normal(0, noise, n)]) if noise > 0 else 50 + 2.0 * t + c * (t >= k)
    fits = []
    for kk in range(4, n - 4 + 1):
        design = np.column_stack([np.ones(n), t, (t >= kk).astype(float)])
        beta, *_ = np.linalg.lstsq(design, y, rcond=None)
        resid = y - design @ beta
        fits.append({"k": kk, "c": float(beta[2]), "sse": float(resid @ resid)})
    steps.append({"name": name, "values": [float(v) for v in y], "fits": fits})

# The yearly pattern of the first and the last half of the seasons, by NumPy's reshape and means.
seasons = {}
for name, years, f in [("repeats", 4, lambda y, j: 10 * np.sin(2 * np.pi * j / 12)), ("flips", 4, lambda y, j: (10 if y < 2 else -10) * np.sin(2 * np.pi * j / 12)), ("two-years", 2, lambda y, j: [5, -3, 2, 0, 1, -1, 4, -2, 0, 3, -4, 1][j] * (1 if y == 0 else 0.5))]:
    v = np.array([round(100 + 3 * y + float(f(y, j)), 2) for y in range(years) for j in range(12)])
    grid = v.reshape(years, 12)
    grid = grid - grid.mean(axis=1, keepdims=True)
    h = years // 2
    p, q = grid[:h].mean(axis=0), grid[years - h:].mean(axis=0)
    size = float(np.abs(p).sum() + np.abs(q).sum())
    seasons[name] = {"values": [float(x) for x in v], "difference": float(np.abs(p - q).sum() / size) if size > 0 else None}

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "suitability.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "normal975": float(stats.norm.ppf(0.975)),
    "skew": skew,
    "spearman": spearman,
    "runs": runs,
    "steps": steps,
    "seasons": seasons,
}
(here / "suitability.json").write_text(json.dumps(out, indent=1) + "\n")
