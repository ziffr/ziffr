# Produces basis.json: what SciPy and NumPy say about straight-line trends and changes, for series of the basis tests.
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/basis.py
# basis.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import pathlib

import numpy as np
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
rng = np.random.default_rng(41)
cases = {
    "anscombe-1": [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68],
    "anscombe-2": [9.14, 8.14, 8.74, 8.77, 9.26, 8.1, 6.13, 3.1, 9.13, 7.26, 4.74],
    "perfect-line": [3.5, 5.0, 6.5, 8.0, 9.5, 11.0, 12.5, 14.0],
    "falling-line": [100, 90, 80, 70, 60, 50, 40],
    "flat-with-noise": [float(v) for v in 100 + rng.integers(-5, 6, 24)],
    "trend-with-noise": [float(v) for v in 100 + 7 * np.arange(24) + rng.integers(-3, 4, 24)],
    "season": [float(100 + [20, 0, -20, 0][i % 4]) for i in range(24)],
    "half-edge": [0, 2, 1, 3],
    "constant": [4, 4, 4, 4, 4, 4],
}
out = {"version": VERSION, "script": hashlib.sha256((here / "basis.py").read_bytes()).hexdigest(), "cases": {}}
for name, ys in cases.items():
    x = np.arange(len(ys), dtype=float)
    y = np.array(ys, dtype=float)
    entry = {"values": ys, "changes": [float(v) for v in np.diff(y)]}
    if np.ptp(y) == 0:
        entry["r2"] = None
        entry["residuals"] = [0.0] * len(ys)
    else:
        lr = stats.linregress(x, y)
        entry["r2"] = float(lr.rvalue**2)
        entry["residuals"] = [float(v) for v in y - (lr.intercept + lr.slope * x)]
    out["cases"][name] = entry
(here / "basis.json").write_text(json.dumps(out, indent=1) + "\n")
