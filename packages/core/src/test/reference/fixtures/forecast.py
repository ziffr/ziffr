# Produces forecast.json: what Python says about the seasonal forecast, the track record, the choice between the two Methods
# and the reach chance (spec 0041, ticket 6), written a third way, apart from the code under test and from the TypeScript
# reference (test/reference/forecast.ts):
#   - Holt-Winters (additive) and Holt on exact fractions (fractions.Fraction), in the error-correction form (l += alpha * e,
#     b += alpha * beta * e, s(t) = s(t-m) + gamma * e) where the code uses the component form, and again on NumPy float64;
#   - the variance factor 1 + sum c(i)^2 from the closed form AND by feeding a single unit shock through the same recurrences
#     (the impulse response), the two compared inside this script;
#   - the track record by the literal definition: each period forecast again from the values before it, from scratch;
#   - the normal curve from SciPy (norm.cdf, norm.ppf), and the reach chance from it;
#   - the rule that chooses the Method, on the last third of the series.
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/forecast.py
# forecast.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import math
import pathlib
from fractions import Fraction as F

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
A, B, G = F(1, 2), F(1, 10), F(3, 10)
Z80 = float(stats.norm.ppf(0.9))


def fx(x):
    """A fraction as the text 'num/den' (the fixture keeps them exactly)."""
    return f"{x.numerator}/{x.denominator}"


def dec(text):
    """A value as the code reads it: from its shortest decimal text."""
    return F(str(text))


# ---- Holt-Winters, additive, error-correction form, on exact fractions ----
def hw_run(y, m):
    """The state after the last value, the prediction before each value of the second season on, and the sums of misses.
    `y` is a list of Fractions, None where a period has no value."""
    n = len(y)
    mean1 = sum(y[:m], F(0)) / m
    mean2 = sum(y[m:2 * m], F(0)) / m
    b = (mean2 - mean1) / m
    line = lambda j: mean1 + b * (F(j) - F(m - 1, 2))
    level = line(m - 1)
    s = [y[j] - line(j) for j in range(m)]
    squares, errors, trace = F(0), 0, []
    for t in range(m, n):
        yhat = level + b + s[t - m]
        trace.append({"t": t, "predicted": yhat, "squares": squares, "errors": errors})
        if y[t] is None:
            level = level + b
            s.append(s[t - m])
            continue
        e = y[t] - yhat
        squares += e * e
        errors += 1
        level, b = level + b + A * e, b + A * B * e
        s.append(s[t - m] + G * e)
    return {"level": level, "trend": b, "pattern": s[n - m:], "squares": squares, "errors": errors, "trace": trace, "n": n, "m": m}


def hw_ahead(r, h):
    return r["level"] + h * r["trend"] + r["pattern"][(h - 1) % r["m"]]


def factor_closed(h, m):
    """1 + sum_{i=1}^{h-1} c(i)^2 with c(i) = alpha (1 + i beta) + gamma [m | i] (Hyndman and Athanasopoulos)."""
    out = F(1)
    for i in range(1, h):
        c = A * (1 + i * B) + (G if i % m == 0 else F(0))
        out += c * c
    return out


def factor_impulse(h, m):
    """The same factor by running the recurrences on a single unit shock, with no closed form: the effect on the prediction
    i periods after the shock, i = 1 .. h-1, squared and summed."""
    out = F(1)
    for i in range(1, h):
        level, b, s = F(0), F(0), {}
        # The shock at time 1: e = 1.
        level, b, s[1] = level + b + A, b + A * B, G
        for t in range(2, i + 1):
            level, b, s[t] = level + b, b, s.get(t - m, F(0))
        # The prediction for time i + 1 holds the shock's effect: level + trend + the pattern at i + 1 - m.
        c = level + b + s.get(i + 1 - m, F(0))
        out += c * c
    return out


def hw_variance(r, h):
    return r["squares"] / r["errors"] * factor_closed(h, r["m"])


# ---- Holt on exact fractions, error-correction form ----
def holt_run(y):
    level, b = y[0], y[1] - y[0]
    squares, trace = F(0), []
    for t in range(1, len(y)):
        yhat = level + b
        trace.append({"t": t, "predicted": yhat, "squares": squares, "errors": t - 1})
        e = y[t] - yhat
        squares += e * e
        level, b = level + b + F(1, 2) * e, b + F(1, 2) * F(3, 10) * e
    return {"level": level, "trend": b, "squares": squares, "n": len(y), "trace": trace}


# ---- NumPy float64, the same recurrences in the component form (a cross-check of the exact figures to 1e-9) ----
def hw_numpy(y, m, horizon):
    y = np.array(y, dtype=float)
    a, b_, g = 0.5, 0.1, 0.3
    mean1, mean2 = y[:m].mean(), y[m:2 * m].mean()
    trend = (mean2 - mean1) / m
    pos = np.arange(m) - (m - 1) / 2
    line = mean1 + trend * pos
    level = mean1 + trend * (m - 1) / 2
    s = list(y[:m] - line)
    for t in range(m, len(y)):
        base = level + trend
        new = a * (y[t] - s[t - m]) + (1 - a) * base
        trend = b_ * (new - level) + (1 - b_) * trend
        s.append(g * (y[t] - base) + (1 - g) * s[t - m])
        level = new
    pat = s[len(y) - m:]
    return [float(level + h * trend + pat[(h - 1) % m]) for h in range(1, horizon + 1)]


# ---- the track record by the literal definition: forecast each period again from the values before it ----
def months(start_year, start_month, n):
    out = []
    y, m = start_year, start_month
    for _ in range(n):
        out.append(f"{y}-{m:02d}-01")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def outcomes_hw(y, m):
    """For each period t at least two seasons in, with a value and a value before it: the prediction from the prefix alone, its miss and spread."""
    out = []
    for t in range(2 * m, len(y)):
        if y[t] is None or y[t - 1] is None:
            continue
        r = hw_run(y[:t], m)
        miss = y[t] - hw_ahead(r, 1)
        sd = math.sqrt(float(hw_variance(r, 1)))
        out.append({"t": t, "miss": miss, "sd": sd, "inBand": abs(float(miss)) <= Z80 * sd})
    return out


def outcomes_holt(y):
    """The same for Holt: from the fifth value on, forecast from the values before it (no gaps are looked at: the series is whole)."""
    out = []
    for t in range(4, len(y)):
        if y[t] is None or y[t - 1] is None:
            continue
        r = holt_run(y[:t])
        miss = y[t] - (r["level"] + r["trend"])
        sd = math.sqrt(float(r["squares"] / (t - 1)))
        out.append({"t": t, "miss": miss, "sd": sd, "inBand": abs(float(miss)) <= Z80 * sd})
    return out


def jsonable_outcomes(os_):
    return [{"t": o["t"], "miss": fx(o["miss"]), "sd": o["sd"], "inBand": o["inBand"]} for o in os_]


def choose(y, m):
    """The rule: the smaller typical miss on the last third, on the periods both can be tested on, Holt on a tie or with fewer than 3."""
    n = len(y)
    frm = n - n // 3
    h = {o["t"]: o for o in outcomes_holt(y) if o["t"] >= frm}
    w = {o["t"]: o for o in outcomes_hw(y, m) if o["t"] >= frm}
    both = sorted(set(h) & set(w))
    if len(both) < 3:
        return {"method": "holt", "why": "too-few", "tested": len(both)}
    sh = sum(abs(h[t]["miss"]) for t in both)
    sw = sum(abs(w[t]["miss"]) for t in both)
    return {"method": "holtWinters" if sw < sh else "holt", "why": "better" if sw < sh else "not-better", "tested": len(both), "holtTotal": fx(sh), "seasonalTotal": fx(sw)}


AIRLINE = [112, 118, 132, 129, 121, 135, 148, 148, 136, 119, 104, 118, 115, 126, 141, 135, 125, 149, 170, 170, 158, 133, 114, 140, 145, 150, 178, 163, 172, 178, 199, 199, 184, 162, 146, 166, 171, 180, 193, 181, 183, 218, 230, 242, 209, 191, 172, 194, 196, 196, 236, 235, 229, 243, 264, 272, 237, 211, 180, 201, 204, 188, 235, 227, 234, 264, 302, 293, 259, 229, 203, 229, 242, 233, 267, 269, 270, 315, 364, 347, 312, 274, 237, 278, 284, 277, 317, 313, 318, 374, 413, 405, 355, 306, 271, 306, 315, 301, 356, 348, 355, 422, 465, 467, 404, 347, 305, 336, 340, 318, 362, 348, 363, 435, 491, 505, 404, 359, 310, 337, 360, 342, 406, 396, 420, 472, 548, 559, 463, 407, 362, 405, 417, 391, 419, 461, 472, 535, 622, 606, 508, 461, 390, 432]
rng = np.random.default_rng(699)
SEASON_QUARTER = [-3, 1, 4, -2]
cases = {
    # name: (season, values) with None for a period with no value
    "airline-full": (12, AIRLINE),
    "airline-last-36": (12, AIRLINE[-36:]),
    "airline-last-27": (12, AIRLINE[-27:]),
    "airline-last-24": (12, AIRLINE[-24:]),
    # The Box-Jenkins airline passengers are the textbook series; these are textbook-style:
    "quarterly-sales": (4, [362, 385, 432, 341, 382, 409, 498, 387, 473, 513, 582, 474, 544, 582, 681, 557, 628, 707, 773, 592, 627, 725, 854, 661]),
    # A straight line plus a repeating pattern: recovered exactly, with no miss at all.
    "exact-quarterly": (4, [dec(10 + 2.5 * t + SEASON_QUARTER[t % 4]) for t in range(20)]),
    "exact-weekly": (7, [dec(100 - 3 * t + [0, 5, -2, 8, 1, -9, -3][t % 7]) for t in range(35)]),
    # Worked by hand in the test: m = 2.
    "hand-m2": (2, [10, 20, 12, 24, 14, 28]),
    "decimals": (4, [dec(round(5 + 0.1 * t + [0.3, -0.2, 0.5, -0.6][t % 4] + float(rng.normal(0, 0.05)), 2)) for t in range(16)]),
    "negative-and-zero": (4, [-8, 0, 5, -3, -6, 1, 7, -2, -4, 2, 9, 0, -1, 4, 12, 3]),
    "huge-and-tiny": (4, [dec(v) for v in ["1e15", "2e15", "3e15", "1.5e15", "1.1e15", "2.1e15", "3.2e15", "1.6e15", "1.2e15", "2.2e15", "3.1e15", "1.4e15"]]),
    "gap-after-start": (4, [10, 14, 18, 12, 11, 15, 19, 13, 12, None, 21, 14, 13, 17, 23, 16]),
    "gap-at-end": (4, [10, 14, 18, 12, 11, 15, 19, 13, 12, 16, 21, 14, 13, 17, None, 16]),
    "noisy-line-36": (12, [round(float(50 + 2 * t + rng.normal(0, 4))) for t in range(36)]),
    "noisy-line-48": (12, [round(float(50 + 2 * t + rng.normal(0, 4))) for t in range(48)]),
    "seasonal-noise-48": (12, [round(float(50 + 2 * t + 15 * math.sin(2 * math.pi * t / 12) + rng.normal(0, 3)), 1) for t in range(48)]),
}


def as_fractions(vs):
    return [None if v is None else (v if isinstance(v, F) else dec(v)) for v in vs]


HORIZON = 14
out_cases = {}
for name, (m, raw) in cases.items():
    y = as_fractions(raw)
    first_year, first_month = 2020, 1
    entry = {"season": m, "values": [None if v is None else float(v) for v in y], "periods": months(first_year, first_month, len(y))}
    ok = len(y) >= 2 * m and all(v is not None for v in y[:2 * m])
    entry["canRun"] = bool(ok)
    if ok:
        r = hw_run(y, m)
        entry["holtWinters"] = {
            "level": fx(r["level"]), "trend": fx(r["trend"]), "pattern": [fx(p) for p in r["pattern"]], "squares": fx(r["squares"]), "errors": r["errors"],
            "ahead": [{"h": h, "exact": fx(hw_ahead(r, h)), "double": float(hw_ahead(r, h)), "variance": fx(hw_variance(r, h)), "sd": math.sqrt(float(hw_variance(r, h)))} for h in range(1, HORIZON + 1)],
            "numpy": hw_numpy([float(v) if v is not None else math.nan for v in y], m, HORIZON) if all(v is not None for v in y) else None,
            "trace": [{"t": s["t"], "predicted": fx(s["predicted"]), "squares": fx(s["squares"]), "errors": s["errors"]} for s in r["trace"]],
            "backtest": jsonable_outcomes(outcomes_hw(y, m)),
        }
        # The variance factor two ways: the closed form and the impulse response must agree exactly.
        for h in range(1, 3 * m + 2):
            assert factor_closed(h, m) == factor_impulse(h, m), (name, h)
    if all(v is not None for v in y) and len(y) >= 5:
        hr = holt_run(y)
        entry["holt"] = {"level": fx(hr["level"]), "trend": fx(hr["trend"]), "squares": fx(hr["squares"]), "backtest": jsonable_outcomes(outcomes_holt(y))}
    if ok and all(v is not None for v in y):
        entry["choice"] = choose(y, m)
    out_cases[name] = entry

# The variance factor for the seasons that matter, spelled out.
factors = {str(m): [fx(factor_closed(h, m)) for h in range(1, 3 * m + 2)] for m in (2, 4, 7, 12)}

# The normal curve from SciPy: Phi at points over the range a chance is asked at, in both tails.
zs = [-30.0, -20.0, -12.0, -8.0, -6.0, -5.0, -4.0, -3.5, -3.0, -2.6, -2.5, -2.4, -2.0, -1.96, -1.5, -1.2815515655446004, -1.0, -0.5, -0.1, -1e-9, 0.0, 1e-9, 0.1, 0.5, 1.0, 1.2815515655446004, 1.5, 1.96, 2.0, 2.4, 2.5, 2.6, 3.0, 3.5, 4.0, 5.0, 6.0, 8.0, 10.0]
rng2 = np.random.default_rng(1699)
zs += [round(float(z), 4) for z in rng2.uniform(-9, 9, 120)]
normal = [{"z": z, "cdf": float(stats.norm.cdf(z))} for z in zs]

# The reach chance: value, spread and limits (null for none), and what SciPy's normal curve gives.
reach = []
for value, sd, lo, hi in [
    (100, 10, 120, None), (100, 10, 100, None), (100, 10, 80, None), (100, 10, None, 120), (100, 10, None, 100), (100, 10, None, 80),
    (100, 10, 90, 110), (100, 10, 120, 140), (100, 10, 60, 140), (100, 10, 99.5, 100.5), (1.2e6, 8e4, 1.2e6, None), (-5, 2, -4, None),
    (100, 10, 200, None), (100, 1, 140, None), (0, 1, None, None), (3.5, 0.25, 3, 4),
]:
    if lo is None and hi is None:
        chance = None
    elif lo is None:
        chance = float(stats.norm.cdf((hi - value) / sd))
    elif hi is None:
        chance = float(stats.norm.cdf((value - lo) / sd))
    else:
        chance = float(stats.norm.cdf((hi - value) / sd) - stats.norm.cdf((lo - value) / sd))
    reach.append({"value": value, "sd": sd, "min": lo, "max": hi, "chance": chance})

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "forecast.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "z80": Z80,
    "z975": float(stats.norm.ppf(0.975)),
    "factors": factors,
    "normal": normal,
    "reach": reach,
    "cases": out_cases,
}
(here / "forecast.json").write_text(json.dumps(out, indent=1) + "\n")
