# Produces heads-up.json: what Python says about the pair scan behind the Heads-ups (spec 0041, ticket 13), written a third way,
# apart from the code under test (methods/pair-scan.ts, p-value.ts, false-discovery.ts) and from the TypeScript reference
# (test/reference/heads-up.ts):
#   - the chance of a correlation by luck from SciPy's Student t (scipy.stats.t.sf), on a grid of r and n (whole and fractional),
#     and from scipy.stats.pearsonr on generated data;
#   - Benjamini-Hochberg: scipy.stats.false_discovery_control(method="bh") on lists of chances, and the pairs reported at a rate;
#   - the effective count (Bartlett) by NumPy's np.correlate, from the definition;
#   - the whole scan of a pair of series written out again: changes by np.diff, each delay's pairs, r by np.corrcoef, the chance
#     by SciPy, the smallest chance times the delays looked at, the halves, the history before the last 6 periods and the last 6
#     with the chance of a drop from scipy.stats.norm.
# Run offline (CI needs neither): python3 packages/core/src/test/reference/fixtures/heads-up.py
# heads-up.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
import hashlib
import json
import pathlib

import numpy as np
import scipy
from scipy import stats

here = pathlib.Path(__file__).parent
VERSION = 1
MIN_PAIRS, MAX_LAG, RECENT = 12, 3, 6
DELAYS = [0] + [x for i in range(1, MAX_LAG + 1) for x in (i, -i)]


def p_of_r(r, n):
    """Two-sided chance of |r| over n pairs (n may be a fraction): Student t with n - 2 degrees of freedom."""
    if abs(r) == 1:
        return 0.0
    if r == 0:
        return 1.0
    df = n - 2
    t = abs(r) * np.sqrt(df / ((1 - abs(r)) * (1 + abs(r))))
    return float(2 * stats.t.sf(t, df))


def rho_of(series):
    """The autocorrelations at delays 1..12 of a whole series (None is a gap): sums over the values it has, from np.correlate on the centred series."""
    v = [x for x in series if x is not None]
    if len(v) == 0 or np.std(v) == 0:
        return [0.0] * 12
    m = float(np.mean(v))
    if len(v) == len(series):
        c = np.asarray(series, float) - m
        full = np.correlate(c, c, mode="full")[len(c) - 1:]
        return [float(full[k] / full[0]) if k < len(c) else 0.0 for k in range(1, 13)]
    ss = sum((x - m) ** 2 for x in v)
    out = []
    for k in range(1, 13):
        total = sum((series[t] - m) * (series[t + k] - m) for t in range(len(series) - k) if series[t] is not None and series[t + k] is not None)
        out.append(total / ss)
    return out


def effective(n, rho_x, rho_y):
    """n / (1 + 2 * sum rho_x(k) rho_y(k)), k up to min(n // 3, 12); never above n."""
    total = sum(rho_x[k - 1] * rho_y[k - 1] for k in range(1, min(n // 3, 12) + 1))
    return float(n / max(1.0, 1 + 2 * total))


def lag_pairs(a, b, lag, lo, hi):
    leader, follower, gap = (a, b, lag) if lag >= 0 else (b, a, -lag)
    at, lead, follow = [], [], []
    for u in range(max(lo, gap), min(hi, len(follower) - 1) + 1):
        l, f = leader[u - gap], follower[u]
        if l is not None and f is not None:
            at.append(u)
            lead.append(l)
            follow.append(f)
    return at, lead, follow


def lag_window(a, b, lo, hi):
    ra, rb = rho_of(a), rho_of(b)
    found = []
    for lag in DELAYS:
        at, lead, follow = lag_pairs(a, b, lag, lo, hi)
        if len(at) < MIN_PAIRS or np.std(lead) == 0 or np.std(follow) == 0:
            continue
        r = float(np.corrcoef(lead, follow)[0, 1])
        r = max(-1.0, min(1.0, r))
        n_eff = effective(len(at), ra, rb)
        p = 1.0 if n_eff < 4 else p_of_r(r, n_eff)
        found.append({"lag": lag, "at": at, "lead": lead, "follow": follow, "r": r, "nEff": n_eff, "p": p})
    if not found:
        return None
    best = found[0]
    for w in found[1:]:
        if w["p"] < best["p"]:
            best = w
    return best, len(found)


def p_half(lead, follow, ra, rb):
    """The chance of one half of a window's pairs on its own: the effective count of the half from the whole series' autocorrelations."""
    if np.std(lead) == 0 or np.std(follow) == 0:
        return None, 1.0
    r = max(-1.0, min(1.0, float(np.corrcoef(lead, follow)[0, 1])))
    n_eff = effective(len(lead), ra, rb)
    return r, (1.0 if n_eff < 4 else p_of_r(r, n_eff))


def window_out(w, tries, ra, rb):
    """A window as the code reports it: the best delay's chance times the delays looked at (pDelays), each half, and the larger of the three (p)."""
    p_delays = min(1.0, tries * w["p"])
    cut = len(w["at"]) // 2
    r1, p1 = p_half(w["lead"][:cut], w["follow"][:cut], ra, rb)
    r2, p2 = p_half(w["lead"][cut:], w["follow"][cut:], ra, rb)
    return {"lag": w["lag"], "r": w["r"], "n": len(w["at"]), "nEff": w["nEff"], "pDelays": p_delays, "p": max(p_delays, p1, p2), "tries": tries,
            "rFirst": r1, "nFirst": cut, "rSecond": r2, "nSecond": len(w["at"]) - cut}


def scan(levels_a, levels_b):
    """The pair scan of two series of levels (one per period, no gaps): changes first."""
    ch = lambda v: [None] + [float(v[i]) - float(v[i - 1]) for i in range(1, len(v))]
    a, b = ch(levels_a), ch(levels_b)
    # The first position has no change; positions count from the first level (the code counts from the first change: the same up to a shift).
    a, b = a[1:], b[1:]
    ra, rb = rho_of(a), rho_of(b)
    last = len(a) - 1
    got = lag_window(a, b, 0, last)
    if got is None:
        return None
    w, tries = got
    out = {"through": last, "full": window_out(w, tries, ra, rb)}
    earlier = lag_window(a, b, 0, last - RECENT)
    out["before"] = None
    if earlier is not None:
        ew, etries = earlier
        before = window_out(ew, etries, ra, rb)
        at, lead, follow = lag_pairs(a, b, ew["lag"], last - RECENT + 1, last)
        before["recent"] = None
        if len(at) == RECENT and np.std(lead) > 0 and np.std(follow) > 0:
            r = float(np.corrcoef(lead, follow)[0, 1])
            sign = -1.0 if ew["r"] < 0 else 1.0
            with np.errstate(all="ignore"):
                drop = float(np.arctanh(abs(ew["r"])) - np.arctanh(sign * r))
            spread = float(np.sqrt(1 / (ew["nEff"] - 3) + 1 / (RECENT - 3)))
            drop_p = 1.0 if (ew["nEff"] < 4 or np.isnan(drop)) else float(stats.norm.cdf(-drop / spread))
            before["recent"] = {"r": r, "n": RECENT, "dropP": drop_p}
        out["before"] = before
    return out


# ---- the chance by luck ----
grid = []
for n in [3, 3.5, 4, 5, 6, 8, 12, 12.5, 18, 24, 36, 36.7, 60, 90, 119, 119.5, 150]:
    for r in [1e-9, 0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 0.999, 0.99999, 1 - 1e-9, -0.3, -0.7, -0.99]:
        grid.append({"r": r, "n": n, "p": p_of_r(r, n)})
rng = np.random.default_rng(1313)
for _ in range(200):
    n = float(rng.uniform(3, 120))
    r = float(rng.uniform(-1, 1)) * float(rng.choice([1, 1, 0.3, 0.05]))
    grid.append({"r": round(r, 6), "n": round(n, 3), "p": p_of_r(round(r, 6), round(n, 3))})

pearson_cases = []
for k in range(24):
    n = int(rng.integers(6, 80))
    x = [round(float(v), 2) for v in rng.normal(0, 5, n)]
    rho = float(rng.choice([0.0, 0.3, 0.7, 0.9, 0.99]))
    y = [round(rho * 1.0 * xv + float(rng.normal(0, 5 * np.sqrt(max(1 - rho ** 2, 1e-6)))), 2) for xv in x]
    res = stats.pearsonr(x, y)
    pearson_cases.append({"x": x, "y": y, "r": float(res.statistic), "p": float(res.pvalue)})

# ---- Benjamini-Hochberg ----
bh = []
cases = [
    [0.01, 0.04, 0.03, 0.005],
    [0.9, 0.8, 0.7],
    [0.0, 1.0, 0.5, 0.5, 0.5],
    [0.1],
    [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
    [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216, 0.222, 0.251, 0.269, 0.275, 0.34, 0.341, 0.384, 0.569, 0.594, 0.696, 0.762, 0.94, 0.942, 0.975, 0.986],
    [0.02, 0.02, 0.02, 0.2],
]
rng2 = np.random.default_rng(2718)
cases.append([float(v) for v in np.round(rng2.uniform(0, 1, 40), 4)])
cases.append([float(v) for v in np.concatenate([rng2.uniform(0, 1, 300), rng2.uniform(0, 0.002, 12)])])
cases.append([float(v) for v in rng2.beta(0.2, 3, 150)])
for ps in cases:
    adjusted = [float(v) for v in stats.false_discovery_control(ps, method="bh")]
    reported = {str(q): [bool(v <= q) for v in adjusted] for q in (0.05, 0.1, 0.2, 0.5)}
    bh.append({"ps": ps, "adjusted": adjusted, "reported": reported})

# ---- the effective count ----
eff = []
for k in range(14):
    n = int(rng2.integers(12, 100))
    phi = float(rng2.choice([0.0, 0.5, 0.8, 0.95, -0.5]))
    def ar(phi):
        v = np.zeros(n)
        e = rng2.normal(0, 1, n)
        for t in range(1, n):
            v[t] = phi * v[t - 1] + e[t]
        return v
    xs, ys = [round(float(v), 3) for v in ar(phi)], [round(float(v), 3) for v in ar(phi)]
    # The pairs of a window are fewer than the whole series: n pairs.
    pairs_n = max(12, n - int(rng2.integers(0, 4)))
    # A series with gaps: the autocorrelation is read over the values it has.
    gapped = [None if (t % 7 == 3 and k % 2 == 0) else v for t, v in enumerate(xs)]
    eff.append({"x": xs, "y": ys, "xg": gapped, "n": pairs_n, "rhoX": rho_of(xs), "rhoY": rho_of(ys), "rhoXGapped": rho_of(gapped), "nEff": effective(pairs_n, rho_of(xs), rho_of(ys)), "nEffGapped": effective(pairs_n, rho_of(gapped), rho_of(ys))})

# ---- the whole scan of a pair ----
def noise(n, sd=1.0):
    return rng2.normal(0, sd, n)


def to_levels(changes_, start=100.0):
    return [str(round(float(v), 2)) for v in np.concatenate([[start], start + np.cumsum(changes_)])]


scans = []
n = 47  # changes, so 48 levels
base = noise(n)
named = {}
named["planted-lag-2"] = (to_levels(base), to_levels(np.concatenate([[0, 0], base[:-2]]) * 0.9 + noise(n, 0.2)))
named["planted-lag-minus-1"] = (to_levels(np.concatenate([[0], base[:-1]]) * 0.9 + noise(n, 0.2)), to_levels(base))
named["same-period"] = (to_levels(base), to_levels(base * 1.5 + noise(n, 0.3)))
named["independent"] = (to_levels(noise(n)), to_levels(noise(n)))
named["independent-2"] = (to_levels(noise(n)), to_levels(noise(n)))
x = np.cumsum(noise(60)) + 100
y = np.cumsum(noise(60)) + 100
named["random-walks-in-levels"] = ([str(round(float(v), 2)) for v in x], [str(round(float(v), 2)) for v in y])
smooth = lambda v: np.convolve(v, np.ones(4) / 4, mode="valid")
named["smoothed-changes"] = (to_levels(smooth(noise(n + 3))), to_levels(smooth(noise(n + 3))))
stopping = noise(n)
named["stopped"] = (to_levels(stopping), to_levels(np.concatenate([stopping[:36] * 0.95 + noise(36, 0.1), noise(n - 36)])))
named["short"] = (to_levels(noise(13)), to_levels(noise(13)))
named["constant-growth"] = ([str(100 + i) for i in range(30)], to_levels(noise(29)))
named["opposite"] = (to_levels(base), to_levels(-base * 1.2 + noise(n, 0.3)))
for name, (la, lb) in named.items():
    scans.append({"name": name, "a": la, "b": lb, "scan": scan(la, lb)})

out = {
    "version": VERSION,
    "script": hashlib.sha256((here / "heads-up.py").read_bytes()).hexdigest(),
    "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
    "chances": grid,
    "pearson": pearson_cases,
    "benjaminiHochberg": bh,
    "effective": eff,
    "scans": scans,
}
(here / "heads-up.json").write_text(json.dumps(out, indent=1) + "\n")
