# Produces what-if.json: what NumPy and SciPy say about the what-if chain (spec 0041, ticket 5): for seeded Metrics A, B, C and D
# the least-squares fits that are the links (B on A, C on B, C on A and B, D on C), each effect with its standard error from the
# inverse of XᵀX, the Student t points at the level the chain asks of each effect (the share 1 − 1 ÷ (10·M) of the t curve for a Metric
# that rests on M estimated effects: 0.9 for one, 0.95 for two, 0.9667 for three), and the change in each Metric reached when A
# changes by x with its range, found as the lowest and highest of the effect over EVERY corner of the box of the effects' ranges (the
# effect is a sum of products in which each estimated effect stands once, so its extremes are at the corners).
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/what-if.py
# what-if.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import itertools
import json
import pathlib

import numpy as np
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1


def fit(y, X):
    n, k = X.shape
    d = np.column_stack([np.ones(n), X])
    beta, *_ = np.linalg.lstsq(d, y, rcond=None)
    resid = y - d @ beta
    sigma2 = float(resid @ resid) / (n - k - 1)
    inv = np.linalg.inv(d.T @ d)
    se = np.sqrt(sigma2 * np.diag(inv))[1:]
    return {"effects": beta[1:].tolist(), "se": se.tolist(), "df": n - k - 1}


def interval(f, j, p):
    t = float(stats.t.ppf(p, f["df"]))
    b = f["effects"][j]
    h = t * f["se"][j]
    return (b - h, b + h)


def corners(parts, fn):
    """The lowest and highest of fn over every corner of the boxes in `parts` (each a (lo, hi))."""
    values = [fn(*c) for c in itertools.product(*parts)]
    return min(values), max(values)


def world(seed, n, noise=(1.0, 6.0, 5.0)):
    rng = np.random.default_rng(seed)
    a = np.round(rng.uniform(20, 80, n), 1)
    b = np.round(3.0 * a + rng.normal(0, noise[0] * 45, n), 1)
    c = np.round(2.0 * b + 0.5 * a + rng.normal(0, noise[1] * 4, n), 1)
    d = np.round(-1.5 * c + rng.normal(0, noise[2] * 8, n), 1)
    return a, b, c, d


cases = []
for seed, n in [(5, 24), (11, 36), (23, 60), (37, 18)]:
    a, b, c, d = world(seed, n)
    fb = fit(b, a.reshape(-1, 1))                    # B on A
    fc = fit(c, b.reshape(-1, 1))                    # C on B
    fca = fit(c, np.column_stack([a, b]))            # C on A and B
    fd = fit(d, c.reshape(-1, 1))                    # D on C
    x = 7.5
    out = {"seed": seed, "n": n, "a": a.tolist(), "b": b.tolist(), "c": c.tolist(), "d": d.tolist(), "x": x}
    # One step: B reached through one effect (M = 1, p = 0.9).
    bb = fb["effects"][0]
    lo, hi = interval(fb, 0, 0.9)
    out["one"] = {"effect": x * bb, "lo": min(x * lo, x * hi), "hi": max(x * lo, x * hi)}
    # Two steps A -> B -> C (M = 2, p = 0.95): the effect is x·b·c.
    cc = fc["effects"][0]
    pb, pc = interval(fb, 0, 0.95), interval(fc, 0, 0.95)
    lo2, hi2 = corners([pb, pc], lambda b_, c_: x * b_ * c_)
    out["two"] = {"effect": x * bb * cc, "lo": lo2, "hi": hi2}
    # Three steps are not followed, but D beside C on its own is a fit of its own link (A -> B -> C -> D is out of reach).
    # Two paths to C: directly from A and through B (M = 3, p = 1 − 0.1 ÷ 3): x·(c_A + c_B·b).
    pa3, pb3, pc3 = interval(fca, 0, 1 - 0.1 / 3), interval(fca, 1, 1 - 0.1 / 3), interval(fb, 0, 1 - 0.1 / 3)
    ca, cb = fca["effects"]
    lo3, hi3 = corners([pa3, pb3, pc3], lambda ca_, cb_, b_: x * (ca_ + cb_ * b_))
    out["paths"] = {"effect": x * (ca + cb * bb), "lo": lo3, "hi": hi3, "p": 1 - 0.1 / 3}
    out["quantiles"] = {str(p): [float(stats.t.ppf(p, df)) for df in (fb["df"], fc["df"], fca["df"])] for p in (0.9, 0.95, 1 - 0.1 / 3)}
    out["se"] = {"fb": fb["se"], "fc": fc["se"], "fca": fca["se"]}
    out["effects"] = {"fb": fb["effects"], "fc": fc["effects"], "fca": fca["effects"], "fd": fd["effects"]}
    cases.append(out)

doc = {
    "script": hashlib.sha256((here / "what-if.py").read_bytes()).hexdigest(),
    "version": VERSION,
    "tools": {"numpy": np.__version__, "scipy": __import__("scipy").__version__},
    "cases": cases,
}
(here / "what-if.json").write_text(json.dumps(doc, indent=1) + "\n")
print("wrote", len(cases), "cases")
