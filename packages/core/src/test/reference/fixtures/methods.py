# Produces methods.json: what SciPy and NumPy say about the Methods of the library's first part (spec 0041, ticket 3):
# Spearman's rank correlation (scipy.stats.spearmanr), partial correlation (NumPy least squares for the part of each
# left after the others, then scipy.stats.pearsonr, and checked here against the textbook formula from the matrix of
# correlations), lagged correlation (scipy.stats.pearsonr on each shifted pair), quantiles (numpy.quantile, method
# "linear", checked here against scipy.stats.mstats.mquantiles with alphap = betap = 1, which is the same type 7), the
# share of the largest rows and the Pareto count (NumPy sorted and cumulated), the parts of a bridge (NumPy differences) and
# the normal curve's points for a chance shared among 1 to 7 looks.
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/methods.py
# methods.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import pathlib

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
rng = np.random.default_rng(2041)


def two(v):
    """Values written to two decimals, so that the text is exact."""
    return [round(float(x), 2) for x in v]


# ---- Spearman's rank correlation ----
anscombe_x = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
anscombe_y1 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
anscombe_y2 = [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74]
anscombe_y3 = [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73]
spearman_cases = {
    "anscombe-1": (anscombe_x, anscombe_y1),
    "anscombe-2": (anscombe_x, anscombe_y2),
    "anscombe-3": (anscombe_x, anscombe_y3),
    "perfect-monotone": ([1, 2, 3, 4, 5, 6, 7], [1, 8, 27, 64, 125, 216, 343]),
    "perfect-reverse": ([1, 2, 3, 4, 5, 6, 7], [49, 36, 25, 16, 9, 4, 1]),
    "ties": ([1, 1, 2, 2, 3, 3, 4, 4], [1, 2, 2, 3, 3, 4, 4, 5]),
    "ties-heavy": ([1, 1, 1, 2, 2, 2, 3, 3, 3, 4], [4, 4, 3, 3, 3, 2, 2, 1, 1, 1]),
    "far-off": ([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 6, 5, 8, 1000]),
    "normal": (two(rng.normal(100, 5, 24)), two(rng.normal(50, 3, 24))),
    "lognormal-linked": (two(rng.lognormal(3, 1.2, 24)), two(rng.lognormal(2, 0.8, 24))),
    "small-decimals": ([0.01, 0.02, 0.015, 0.03, 0.025, 0.04], [0.5, 0.45, 0.55, 0.4, 0.6, 0.35]),
}
spearman = {}
for name, (a, b) in spearman_cases.items():
    spearman[name] = {"a": [float(x) for x in a], "b": [float(x) for x in b], "rho": float(stats.spearmanr(a, b).statistic)}

# ---- Partial correlation ----
def partial_by_residuals(a, b, controls):
    design = np.column_stack([np.ones(len(a))] + [np.array(c, dtype=float) for c in controls])
    ra = np.array(a, dtype=float) - design @ np.linalg.lstsq(design, np.array(a, dtype=float), rcond=None)[0]
    rb = np.array(b, dtype=float) - design @ np.linalg.lstsq(design, np.array(b, dtype=float), rcond=None)[0]
    return float(stats.pearsonr(ra, rb).statistic)


def partial_by_matrix(a, b, controls):
    # The textbook formula: r(ab.C) = -P[a,b] / sqrt(P[a,a] P[b,b]) with P the inverse of the matrix of correlations.
    data = np.array([a, b] + controls, dtype=float)
    p = np.linalg.inv(np.corrcoef(data))
    return float(-p[0, 1] / np.sqrt(p[0, 0] * p[1, 1]))


partial = {}
n = 30
z1 = two(rng.normal(50, 10, n))
z2 = two(rng.normal(20, 4, n))
z3 = two(rng.normal(0, 1, n))
z4 = two(rng.normal(100, 25, n))
cases = {
    # a and b both follow z1: held at z1, what is left is noise.
    "common-cause": (two(np.array(z1) * 2 + rng.normal(0, 3, n)), two(np.array(z1) * 3 + rng.normal(0, 4, n)), [z1]),
    # a and b linked and z1 adds to both.
    "linked-and-confounded": (two(np.array(z1) + rng.normal(0, 3, n)), two(np.array(z1) + 0.0), [z2]),
    "two-controls": (two(np.array(z1) + 2 * np.array(z2) + rng.normal(0, 5, n)), two(np.array(z2) - np.array(z3) + rng.normal(0, 5, n)), [z1, z2]),
    "three-controls": (two(np.array(z1) + np.array(z3) + rng.normal(0, 5, n)), two(np.array(z4) / 5 + np.array(z3) + rng.normal(0, 5, n)), [z1, z2, z3]),
    "four-controls": (two(np.array(z1) + rng.normal(0, 5, n)), two(np.array(z1) / 2 + np.array(z4) / 10 + rng.normal(0, 5, n)), [z1, z2, z3, z4]),
    # a equals b plus a tiny wobble: partial r is close to 1, and S is not singular.
    "a-is-b": (two(np.array(z1) + 0.0), two(np.array(z1) + rng.normal(0, 0.5, n)), [z2]),
}
for name, (a, b, controls) in cases.items():
    by_res = partial_by_residuals(a, b, controls)
    by_mat = partial_by_matrix(a, b, controls)
    assert abs(by_res - by_mat) < 1e-9, (name, by_res, by_mat)
    partial[name] = {"a": a, "b": b, "controls": controls, "r": by_res}

# ---- Lagged correlation ----
def lagged(a, b, max_lag):
    out = []
    for lag in range(max_lag + 1):
        if len(a) - lag < 6:
            continue
        x, y = np.array(a[: len(a) - lag], dtype=float), np.array(b[lag:], dtype=float)
        if np.ptp(x) == 0 or np.ptp(y) == 0:
            out.append({"lag": lag, "r": None, "n": len(x)})
        else:
            out.append({"lag": lag, "r": float(stats.pearsonr(x, y).statistic), "n": len(x)})
    return out


lead = two(rng.normal(0, 10, 36))
lag_cases = {
    # b follows a by two periods exactly.
    "perfect-lag-2": (lead, [0.0, 0.0] + lead[:-2]),
    "noisy-lag-3": (lead, two(np.array([0.0, 0.0, 0.0] + lead[:-3]) * 2 + rng.normal(0, 4, 36))),
    "no-link": (two(rng.normal(0, 10, 24)), two(rng.normal(0, 10, 24))),
    "same-time": (lead, two(np.array(lead) * -1.5 + rng.normal(0, 3, 36))),
    "short": (two(rng.normal(0, 10, 12)), two(rng.normal(0, 10, 12))),
}
lag = {name: {"a": [float(x) for x in a], "b": [float(x) for x in b], "lags": lagged(a, b, 6)} for name, (a, b) in lag_cases.items()}

# ---- Quantiles ----
quantile_lists = {
    "one": [7.0],
    "two": [3.0, 9.0],
    "seven": [3.5, 1.25, 9.0, 4.0, 4.0, 8.75, 2.0],
    "eight": [10.0, 2.0, 8.0, 4.0, 6.0, 12.0, 14.0, 16.0],
    "negative": [-5.5, 3.25, -2.0, 0.0, 7.5, -9.75, 1.0, 2.5, 4.0],
    "normal": two(rng.normal(100, 15, 25)),
    "lognormal": two(rng.lognormal(3, 1, 40)),
    "ties": [5.0, 5.0, 5.0, 6.0, 6.0, 9.0, 9.0, 9.0, 9.0, 10.0],
    "tiny": [0.001, 0.002, 0.0035, 0.0041, 0.009],
}
probabilities = [0.0, 0.1, 0.25, 0.3, 0.5, 0.75, 0.9, 1.0]
quantile = {}
for name, v in quantile_lists.items():
    x = np.array(v)
    got = {str(p): float(np.quantile(x, p, method="linear")) for p in probabilities}
    other = stats.mstats.mquantiles(x, prob=probabilities, alphap=1, betap=1)
    for p, o in zip(probabilities, other):
        assert abs(got[str(p)] - float(o)) <= 1e-12 * max(1.0, abs(float(o))), (name, p)
    quantile[name] = {"values": v, "quantiles": got}

# ---- Share of the largest rows, Pareto ----
share_lists = {
    "eight": [40.0, 25.0, 12.0, 8.0, 6.0, 5.0, 3.0, 1.0],
    "ties": [10.0, 10.0, 10.0, 5.0, 5.0, 5.0, 1.0],
    "decimals": [1234.56, 987.65, 450.25, 300.1, 120.05, 99.99, 40.4],
    "dominant": [900.0, 50.0, 30.0, 20.0],
    "even": [10.0, 10.0, 10.0, 10.0, 10.0],
    "with-zero": [50.0, 30.0, 0.0, 20.0, 0.0],
    "long": two(rng.lognormal(4, 1, 12)),
}
shares = {}
for name, v in share_lists.items():
    x = np.sort(np.array(v))[::-1]
    total = float(x.sum())
    cumulative = np.cumsum(x) / total
    # The Pareto count is the fewest rows whose share reaches 0.8. A share this close to it is exactly 0.8 in these two (the
    # values add to a whole number of tenths), which "reaches" counts; any other close call would need exact arithmetic.
    assert not np.any(np.abs(cumulative - 0.8) < 1e-9) or name in ("even", "with-zero"), name
    count = int(np.argmax(cumulative >= 0.8 - 1e-12)) + 1
    shares[name] = {"values": v, "top": [float(c) for c in cumulative[:-1]], "pareto80": count}

# ---- The parts of a bridge ----
bridge_cases = {
    "regions": ([("Germany", 120.0, 85.0), ("Austria", 40.0, 31.0), ("France", 22.0, 24.0)]),
    "decimals": ([("A", 10.25, 10.5), ("B", 0.1, 0.3), ("C", 3.3, 1.1)]),
}
bridge = {}
for name, parts in bridge_cases.items():
    changes = [float(np.float64(a) - np.float64(b)) for _, b, a in parts]
    bridge[name] = {"parts": [{"label": l, "before": b, "after": a} for l, b, a in parts], "changes": changes, "total": float(np.sum(np.array([a for _, _, a in parts]) - np.array([b for _, b, _ in parts])))}

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "methods.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "chanceByTries": [float(stats.norm.ppf(1 - 0.025 / t)) for t in range(1, 8)],
    "spearman": spearman,
    "partial": partial,
    "lag": lag,
    "quantile": quantile,
    "shares": shares,
    "bridge": bridge,
}
(here / "methods.json").write_text(json.dumps(out, indent=1) + "\n")
