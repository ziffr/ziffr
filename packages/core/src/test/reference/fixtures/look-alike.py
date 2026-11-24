# Produces look-alike.json: what Python says about the Look-alike (spec 0053, ticket 3), written from the spec's definitions on exact
# fractions and apart from the code under test (methods/look-alike.ts) and from the TypeScript reference (test/reference/look-alike.ts):
#   - the exact part uses only the standard library (fractions, datetime, random): the periods in common, each Metric read as its values
#     or as its distance from its straight-line trend, one scale (weight 1 / population variance), Ward's method by the plain search over
#     every pair at every step with each cost from the kinds' sums, the tie rule, the counts 2 to 4 and the smallest kind, the gap squared,
#     Cliff's count, what marks a kind, the periods as runs and the time of year;
#   - 200 generated cases (seeded) of 24 to 60 periods in common and 2 to 6 Metrics: noise, flat and skewed values, counts with many ties,
#     Metrics that trend, a smooth yearly wave, kinds planted on several Metrics, gaps, periods outside the common ones, and the refusals
#     (a constant Metric, a perfect line, too few periods, too many Metrics, one Metric, a far-off month that leaves no count);
#   - a Metric that trends is read as its distance from its line, which the code works out in floating point: the leftover is rounded to
#     the nearest double (Python's float(Fraction) rounds correctly) and read back from its shortest text, as the code does, and the case
#     is worked out again on the unrounded leftovers: the kinds must not change ("trendRounding");
#   - SciPy, for sanity: scipy.cluster.hierarchy.linkage(method="ward") on the scaled values (each Metric divided by the square root of its
#     population variance) must join the same kinds in the same order, and cut_tree at 2, 3 and 4 kinds must give the same kinds, in every
#     case with no near tie. A NEAR TIE is: at some step of Ward's method, the two smallest costs of joining any two kinds (exact fractions)
#     are equal, or differ by less than one part in 10^9 of the smaller. Those cases are skipped, and named in the fixture
#     ("scipy.skipped"), because SciPy's tie order is not Ziffr's written rule.
# Run offline (CI needs neither Python nor SciPy): python3 packages/core/src/test/reference/fixtures/look-alike.py
# look-alike-fixture.test.ts fails when the "script" hash in the fixture is not the hash of this file, so edit this file => rerun it.
# The script stops without writing the fixture when SciPy disagrees on a case that has no near tie.
import datetime
import hashlib
import json
import math
import pathlib
import random
import sys
from fractions import Fraction

here = pathlib.Path(__file__).parent
VERSION = 1
SEED = 5300
CASES = 200
FEWEST, MOST, METRICS_MOST, PERIODS_EACH = 24, 60, 6, 6
NEAR = Fraction(1, 10**9)
LEVELS = [(Fraction(4, 5), "very-high"), (Fraction(1, 2), "high"), (Fraction(-4, 5), "very-low"), (Fraction(-1, 2), "low")]


# ---- calendar: periods are first days, written yyyy-mm-dd ----

def start_of(span, i, first):
    """The period i steps after the first one (a date)."""
    if span == "day":
        return first + datetime.timedelta(days=i)
    if span == "week":
        return first + datetime.timedelta(days=7 * i)
    months = {"month": 1, "quarter": 3}[span] * i
    t = first.year * 12 + first.month - 1 + months
    return datetime.date(t // 12, t % 12 + 1, 1)


def steps_between(span, a, b):
    """How many periods lie from the date a to the later date b."""
    if span == "day":
        return (b - a).days
    if span == "week":
        return (b - a).days // 7
    months = (b.year - a.year) * 12 + b.month - a.month
    return months if span == "month" else months // 3


def date_of(text):
    return datetime.date(int(text[0:4]), int(text[5:7]), int(text[8:10]))


# ---- the series ----

def prepare(series, span, trend_rounding):
    """The periods in common (the latest 60), the Metrics in the order of their ids, how each is read and its values by period."""
    ordered = sorted(series, key=lambda s: s["id"])
    sets = [dict((p, Fraction(v)) for p, v in s["points"]) for s in ordered]
    common = sorted(set.intersection(*[set(s) for s in sets])) if sets else []
    periods = common[-MOST:]
    days = [date_of(p) for p in periods]
    xs = [steps_between(span, days[0], d) for d in days] if periods else []
    reading, columns = [], []
    for s in sets:
        ys = [s[p] for p in periods]
        n = len(ys)
        if n >= 2:
            mx, my = Fraction(sum(xs), n), sum(ys) / n
            sxx = sum((x - mx) ** 2 for x in xs)
            sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
            syy = sum((y - my) ** 2 for y in ys)
            if syy != 0 and sxy * sxy / (sxx * syy) > Fraction(1, 2):
                slope = sxy / sxx
                left = [y - (my + slope * (x - mx)) for x, y in zip(xs, ys)]
                if trend_rounding:
                    # What the code does: the nearest double of the leftover, read back by its shortest text.
                    left = [Fraction(repr(float(e))) for e in left]
                reading.append("trend")
                columns.append(left)
                continue
        reading.append("values")
        columns.append(ys)
    rows = [[c[i] for c in columns] for i in range(len(periods))]
    return {"span": span, "periods": periods, "ids": [s["id"] for s in ordered], "reading": reading, "rows": rows}


def weights(rows):
    """1 / the population variance of each Metric; the first Metric that does not vary, if any."""
    n, m = len(rows), len(rows[0])
    w = []
    for j in range(m):
        mean = sum(r[j] for r in rows) / n
        var = sum((r[j] - mean) ** 2 for r in rows) / n
        if var == 0:
            return None, j
        w.append(1 / var)
    return w, None


# ---- Ward's method, the plain search over every pair at every step ----

def ward(rows, w):
    """Ward's joins, each (left periods, right periods, cost), the kinds at 4, 3 and 2, and the two smallest costs at every step."""
    m = len(w)
    kinds = [{"id": i, "members": [i], "sums": list(rows[i]), "first": i} for i in range(len(rows))]
    known = {}  # a cost is worked out from the two kinds' sums once, and again only for a kind that was just made
    merges, states, lowest = [], {}, []

    def cost(a, b):
        key = (a["id"], b["id"])
        if key not in known:
            na, nb = len(a["members"]), len(b["members"])
            far = sum(w[j] * (a["sums"][j] / na - b["sums"][j] / nb) ** 2 for j in range(m))
            known[key] = Fraction(na * nb, na + nb) * far
        return known[key]

    next_id = len(rows)
    while len(kinds) > 1:
        if len(kinds) <= 4:
            states[len(kinds)] = sorted((sorted(k["members"]) for k in kinds), key=lambda g: g[0])
        found = []
        for x in range(len(kinds)):
            for y in range(x + 1, len(kinds)):
                a, b = kinds[x], kinds[y]
                found.append((cost(a, b), min(a["first"], b["first"]), max(a["first"], b["first"]), x, y))
        found.sort(key=lambda t: t[:3])
        lowest.append((found[0][0], found[1][0] if len(found) > 1 else None))
        c, _, _, x, y = found[0]
        a, b = kinds[x], kinds[y]
        if b["first"] < a["first"]:
            a, b = b, a
        merges.append((sorted(a["members"]), sorted(b["members"]), c))
        joined = {"id": next_id, "members": a["members"] + b["members"], "sums": [p + q for p, q in zip(a["sums"], b["sums"])], "first": a["first"]}
        next_id += 1
        kinds = [k for k in kinds if k is not kinds[x] and k is not kinds[y]] + [joined]
    return merges, states, lowest


def near_tie(lowest):
    """The first step at which the two smallest costs are equal or within 1e-9 of the smaller, or None."""
    for step, (c1, c2) in enumerate(lowest):
        if c2 is not None and (c2 == c1 or c2 - c1 < NEAR * c1):
            return {"step": step + 1, "smallest": text(c1), "second": text(c2)}
    return None


# ---- the gap ----

def means(rows, kind):
    return [sum(rows[i][j] for i in kind) / len(kind) for j in range(len(rows[0]))]


def gap_squared(rows, w, a, b):
    """(d.d)^2 / (d.S.d), d the difference of the kinds' means, S their pooled spread; 'endless' where S gives 0 along d and d is not 0."""
    m = len(w)
    ma, mb = means(rows, a), means(rows, b)
    d = [ma[j] - mb[j] for j in range(m)]
    along = sum(w[j] * d[j] * d[j] for j in range(m))
    spread = Fraction(0)
    for j in range(m):
        for l in range(m):
            s = Fraction(0)
            for kind, mu in ((a, ma), (b, mb)):
                for i in kind:
                    s += (rows[i][j] - mu[j]) * (rows[i][l] - mu[l])
            spread += w[j] * w[l] * d[j] * d[l] * s / (len(a) + len(b) - 2)
    if spread == 0:
        return Fraction(0) if along == 0 else "endless"
    return along * along / spread


def less(x, y):
    """x < y for gaps: an endless gap is above every fraction."""
    if x == "endless":
        return False
    return True if y == "endless" else x < y


def kinds_gap(rows, w, groups):
    pairs = [[x + 1, y + 1, gap_squared(rows, w, groups[x], groups[y])] for x in range(len(groups)) for y in range(x + 1, len(groups))]
    low = pairs[0][2]
    for p in pairs[1:]:
        if less(p[2], low):
            low = p[2]
    return low, pairs


# ---- what marks a kind ----

def level_of(c):
    for bar, name in LEVELS:
        if (c >= bar) if bar > 0 else (c <= bar):
            return name
    return None


def cliff(rows, j, kind):
    inside = set(kind)
    net = 0
    for i in kind:
        for o in range(len(rows)):
            if o not in inside:
                net += (rows[i][j] > rows[o][j]) - (rows[i][j] < rows[o][j])
    return Fraction(net, len(kind) * (len(rows) - len(kind)))


def words_of(counts):
    """The Metrics a kind has a word on, largest size of the count first, equal sizes in the order of the ids."""
    got = [(abs(c), j, level_of(c)) for j, c in enumerate(counts) if level_of(c)]
    got.sort(key=lambda t: (-t[0], t[1]))
    return [(j, lv) for _, j, lv in got]


def name_kinds(counts):
    """[(marks, ordinal)] per kind: the two Metrics with the largest size; kinds named alike get a third Metric they have a word on and
    their twins do not; those still alike are numbered by kind number."""
    ranked = [words_of(c) for c in counts]
    top = [r[:2] for r in ranked]
    key = lambda ms: sorted(ms)
    final = []
    for k, r in enumerate(ranked):
        twins = [o for o in range(len(ranked)) if o != k and key(top[o]) == key(top[k])]
        if twins:
            third = [x for x in r if all(x not in ranked[o] for o in twins)]
            final.append(top[k] + third[:1])
        else:
            final.append(top[k])
    out = []
    for k, ms in enumerate(final):
        same = [o for o in range(len(final)) if key(final[o]) == key(ms)]
        out.append((ms, None if len(same) == 1 else same.index(k) + 1))
    return out


# ---- the time of year and the runs ----

PLACES = {"month": 12, "quarter": 4, "day": 7}


def place_of(period, span, year_start):
    d = date_of(period)
    if span == "month":
        return d.month
    if span == "quarter":
        return (d.month - year_start) % 12 // 3 + 1
    return d.weekday() + 1


def season_of(periods, members, span, year_start):
    if span not in PLACES:
        return None
    window, kept = {}, {}
    for p in periods:
        window[place_of(p, span, year_start)] = window.get(place_of(p, span, year_start), 0) + 1
    for i in members:
        pl = place_of(periods[i], span, year_start)
        kept[pl] = kept.get(pl, 0) + 1
    places = sorted(p for p, k in kept.items() if k >= 2 and 4 * k >= 3 * window[p])
    held = sum(kept[p] for p in places)
    if not places or 4 * held < 3 * len(members):
        return None
    runs = []
    for p in places:
        if runs and runs[-1][1] == p - 1:
            runs[-1][1] = p
        else:
            runs.append([p, p])
    if len(runs) > 1 and runs[0][0] == 1 and runs[-1][1] == PLACES[span]:
        runs = runs[1:-1] + [[runs[-1][0], runs[0][1]]]
    return {"places": places, "runs": sorted(runs)}


def runs_of(periods, span):
    out = []
    for p in periods:
        if out and steps_between(span, date_of(out[-1][1]), date_of(p)) == 1:
            out[-1][1] = p
        else:
            out.append([p, p])
    return out


# ---- the result for one count asked ----

def text(f):
    return f if isinstance(f, str) else f"{f.numerator}/{f.denominator}"


def outcome(p, w, merges, states, asked, year_start):
    rows, n = p["rows"], len(p["rows"])
    smallest = max(3, -(-n // 6))
    feasible = [c for c in (2, 3, 4) if all(len(g) >= smallest for g in states[c])]
    options = feasible if asked is None else [c for c in feasible if c <= asked]
    if not options:
        return {"refused": "no-split"}
    tried = [(c, *kinds_gap(rows, w, states[c])) for c in (options if asked is None else [options[-1]])]
    best = tried[0]
    for t in tried[1:]:
        if less(best[1], t[1]):
            best = t
    groups = states[best[0]]
    counts = [[cliff(rows, j, g) for j in range(len(w))] for g in groups]
    named = name_kinds(counts)
    labels = [next(k for k, g in enumerate(groups) if i in g) + 1 for i in range(n)]
    kinds = []
    for k, g in enumerate(groups):
        periods = [p["periods"][i] for i in g]
        marks, ordinal = named[k]
        kinds.append({
            "periods": periods,
            "runs": runs_of(periods, p["span"]),
            "counts": [text(c) for c in counts[k]],
            "marks": [[p["ids"][j], lv, text(counts[k][j])] for j, lv in marks],
            "ordinal": ordinal,
            "season": season_of(p["periods"], g, p["span"], year_start),
        })
    return {
        "asked": asked,
        "shown": best[0],
        "smallest": smallest,
        "labels": labels,
        "gap": text(best[1]),
        "pairs": [[a, b, text(g)] for a, b, g in best[2]],
        "tried": [[c, text(g)] for c, g, _ in tried],
        "kinds": kinds,
    }


def analyse(case, trend_rounding=True):
    """Everything the fixture says about one case: its refusal, or the periods used, Ward's joins and the result for each count asked."""
    series, span = case["series"], case["span"]
    if len(series) < 2:
        return {"refused": "metrics"}, None
    if len(series) > METRICS_MOST:
        return {"refused": "too-many"}, None
    p = prepare(series, span, trend_rounding)
    if len(p["periods"]) < FEWEST:
        return {"refused": "periods"}, None
    if len(series) > len(p["periods"]) // PERIODS_EACH:
        return {"refused": "too-many"}, None
    w, constant = weights(p["rows"])
    if w is None:
        return {"refused": "constant", "metric": p["ids"][constant]}, None
    merges, states, lowest = ward(p["rows"], w)
    out = {
        "periods": p["periods"],
        "ids": p["ids"],
        "reading": p["reading"],
        "merges": [[a, b, text(c)] for a, b, c in merges],
        "asked": {("null" if a is None else str(a)): outcome(p, w, merges, states, a, case["yearStart"]) for a in (None, 2, 3, 4)},
    }
    return out, (p, w, merges, states, lowest)


# ---- SciPy, for sanity ----

def scipy_check(p, w, merges, states):
    """The joins and the cuts of SciPy's Ward on the scaled values, against ours: a list of what differs (empty when they agree)."""
    import numpy as np
    from scipy.cluster.hierarchy import cut_tree, linkage

    rows = p["rows"]
    n = len(rows)
    scale = [math.sqrt(float(1 / x)) for x in w]  # the standard deviation: weight is 1 / variance
    data = np.array([[float(r[j]) / scale[j] for j in range(len(w))] for r in rows])
    z = linkage(data, method="ward")
    members = {i: frozenset([i]) for i in range(n)}
    differs = []
    for step, row in enumerate(z):
        a, b = members[int(row[0])], members[int(row[1])]
        members[n + step] = a | b
        mine = (frozenset(merges[step][0]), frozenset(merges[step][1]))
        if {a, b} != set(mine):
            differs.append(f"join {step + 1}")
    cuts = cut_tree(z, n_clusters=[2, 3, 4])
    for col, k in enumerate((2, 3, 4)):
        theirs = {}
        for i in range(n):
            theirs.setdefault(int(cuts[i][col]), []).append(i)
        if sorted(sorted(g) for g in theirs.values()) != sorted(sorted(g) for g in states[k]):
            differs.append(f"cut {k}")
    return differs


# ---- the generated cases ----

NAMES = ["Churn", "Orders", "Returns", "Revenue", "Sessions", "Signups", "Support", "Visits"]


def text_of(v, decimals):
    n = round(v * 10**decimals)
    digits = str(abs(n)).rjust(decimals + 1, "0")
    return ("-" if n < 0 else "") + (digits[:-decimals] + "." + digits[-decimals:] if decimals else digits)


def column(rng, kind, n, base, spread, hot, shift):
    """One Metric's n values: its shape, with the `hot` periods raised by `shift` spreads."""
    out = []
    for i in range(n):
        raised = spread * shift if i in hot else 0
        if kind == "noise":
            v = base + spread * rng.gauss(0, 1)
        elif kind == "flat":
            v = base + spread * rng.uniform(-1.7, 1.7)
        elif kind == "skewed":
            v = base + spread * (math.exp(rng.gauss(0, 0.8)) - 1.2)
        elif kind == "counts":
            v = rng.choice([0, 0, 1, 1, 1, 2, 2, 3, 4])
            raised = shift if i in hot else 0
        elif kind == "trend":
            v = base + 0.6 * spread * i + spread * rng.gauss(0, 0.8)
        elif kind == "wave":
            v = base + spread * (math.sin(2 * math.pi * i / 12) + 0.3 * rng.gauss(0, 1))
        elif kind == "walk":
            v = (out[-1] if out else base) + spread * rng.gauss(0, 0.5)
            raised = 0
        else:
            raise ValueError(kind)
        out.append(v + raised)
    return out


REFUSALS = {3: "constant", 4: "line", 5: "periods", 6: "too-many", 7: "no-split", 8: "constant-window"}


def designed_case(number):
    """A case of 4 kinds of period on 3 or 4 Metrics, searched (seeded) until the kinds named alike need a third word (number 35), or a number (number 36): the random cases hardly ever make two kinds that are named alike."""
    rng = random.Random(SEED + number)
    want = {35: "third", 36: "ordinal"}[number]
    while True:
        m, n = rng.choice([3, 4]), 48
        offsets = [[rng.choice([-3, -1.5, 0, 1.5, 3]) for _ in range(m)] for _ in range(4)]
        labels = [i % 4 for i in range(n)]
        rng.shuffle(labels)
        ids = sorted(rng.sample(NAMES, m))
        first = datetime.date(rng.randint(2015, 2022), 1, 1)
        periods = [start_of("month", i, first).isoformat() for i in range(n)]
        series = [{"id": ids[j], "points": [(periods[i], text_of(100 + 10 * (offsets[labels[i]][j] + 0.5 * rng.gauss(0, 1)), 2)) for i in range(n)]} for j in range(m)]
        case = {"id": f"c{number + 1:03d}", "span": "month", "yearStart": 1, "series": series, "shape": {"plan": "designed-" + str(want), "kinds": ["groups"] * m}}
        result, _ = analyse(case)
        if "refused" in result or "refused" in result["asked"]["4"] or result["asked"]["4"]["shown"] != 4 or "trend" in result["reading"]:
            continue
        kinds = result["asked"]["4"]["kinds"]
        if want == "third" and any(len(k["marks"]) == 3 for k in kinds) or want == "ordinal" and any(k["ordinal"] for k in kinds):
            return case


def make_case(rng, number):
    """One case, its shape picked by its number so that the 200 cover every shape (the refusals among them)."""
    plan = number % 20
    if number in (35, 36):
        return designed_case(number)
    refusal = REFUSALS.get(plan) if (number // 20) % 3 == 0 else None
    if number in (9, 109):
        refusal = "metrics"
    if number in (10, 110):
        refusal = "many-metrics"
    span = rng.choice(["month"] * 6 + ["quarter", "week", "day"])
    n = rng.randint(24, 60) if span != "quarter" else rng.randint(24, 40)
    m = rng.randint(2, 6)
    extra_before = rng.choice([0, 0, 0, 5, 10]) if n > 50 else rng.choice([0, 0, 0, 6])
    if refusal == "periods":
        n, m, extra_before = rng.randint(14, 23), rng.randint(2, 3), 0
    elif refusal == "too-many":
        n, m, extra_before = rng.randint(24, 35), 6, 0
    elif refusal == "constant-window":
        span, n, extra_before = "month", 60, 8
    elif refusal == "metrics":
        m = 1
    elif refusal == "many-metrics":
        n, m, extra_before = rng.randint(42, 60), 7, 0
    total = n + extra_before
    # Gaps: a few periods in which some Metrics lack a value, so the periods in common are fewer (never more than a tenth of the window).
    pool = set(rng.sample(range(total), rng.randint(0, total // 10))) if refusal is None else set()
    if refusal is None:
        m = max(2, min(m, (min(total, MOST) - len(pool)) // PERIODS_EACH))
    shapes = rng.choice(
        [["noise"], ["flat"], ["skewed"], ["counts"], ["noise", "skewed", "flat"], ["noise", "trend"], ["counts", "noise"], ["noise", "wave"], ["trend"], ["noise", "counts", "skewed", "flat"], ["walk", "noise"]]
    )
    if span == "week":
        first = datetime.date(2019, 1, 7)
    elif span == "day":
        first = datetime.date(rng.randint(2015, 2022), rng.randint(1, 12), rng.randint(1, 28))
    else:
        first = datetime.date(rng.randint(2015, 2022), 1, 1)
    all_periods = [start_of(span, i, first).isoformat() for i in range(total)]
    # Kinds planted on some Metrics: a time of year raised by a few spreads (months), or a few runs of periods.
    if span == "month" and rng.random() < 0.5:
        hot = {i for i in range(total) if date_of(all_periods[i]).month in (11, 12, 1)}
    else:
        hot = set()
        for _ in range(rng.randint(1, 4)):
            s = rng.randrange(total)
            hot |= set(range(s, min(total, s + rng.randint(2, 5))))
    shift = rng.choice([0, 2, 3, 4, 5])
    carriers = set(rng.sample(range(m), rng.randint(1, m)))
    ids = rng.sample(NAMES, m)
    far = total - 1 - rng.randrange(total // 2)
    # Some cases are 3 or 4 kinds of period, each a level on every Metric (so twins that need a third word, and counts of 3 and 4, occur).
    groups = refusal in (None, "no-split") and rng.random() < 0.4
    if groups:
        k = rng.choice([3, 4])
        labels = [i % k for i in range(total)]
        rng.shuffle(labels)
        offsets = [[rng.choice([-3, -3, 0, 3, 3]) for _ in range(m)] for _ in range(k)]
        shapes = ["groups"]
    series = []
    for j in range(m):
        kind = shapes[j % len(shapes)]
        base = rng.choice([10, 100, 2500, 40000, 1000000])
        spread = base * rng.choice([0.02, 0.05, 0.1, 0.3])
        decimals = 0 if kind == "counts" else rng.choice([0, 1, 2, 2, 3])
        if kind == "groups":
            values = [base + spread * (offsets[labels[i]][j] + 0.5 * rng.gauss(0, 1)) for i in range(total)]
        else:
            values = column(rng, kind, total, base, spread, hot if j in carriers else set(), shift)
        if refusal == "constant" and j == 0:
            values = [round(base, 2)] * total
        elif refusal == "line" and j == 0:
            values, decimals = [base + 3 * i for i in range(total)], 0
        elif refusal == "constant-window" and j == 0:
            values, decimals = [base + 7 * i for i in range(extra_before)] + [base] * n, 1
        elif refusal == "no-split":
            # one far-off month on every Metric: it is a kind of its own at every count, and every kind needs 4 or more months
            values[far] += 40 * spread
        texts = [text_of(v, decimals) for v in values]
        points = list(zip(all_periods, texts))
        points = [pt for i, pt in enumerate(points) if not (i in pool and rng.random() < 0.5)]
        series.append({"id": ids[j], "points": points})
    rng.shuffle(series)
    year_start = rng.choice([1, 1, 4, 7, 10, 2, 3, 12])
    return {"id": f"c{number + 1:03d}", "span": span, "yearStart": year_start, "series": series, "shape": {"plan": refusal or "normal", "kinds": shapes[:m]}}


# ---- main ----

def main():
    rng = random.Random(SEED)
    cases, results, checked, skipped, mismatches = [], [], [], [], []
    for number in range(CASES):
        case = make_case(rng, number)
        result, work = analyse(case)
        cases.append(case)
        entry = {"id": case["id"], "result": result}
        if work is not None:
            p, w, merges, states, lowest = work
            entry["trendRounding"] = None
            if "trend" in p["reading"]:
                # the same case on the unrounded leftovers: the kinds, the counts and the order of joining must not change
                other, other_work = analyse(case, trend_rounding=False)
                pick = lambda r, key: [o[key] for o in r["asked"].values() if key in o]
                same = pick(other, "labels") == pick(result, "labels") and pick(other, "shown") == pick(result, "shown")
                same = same and [m[:2] for m in other["merges"]] == [m[:2] for m in result["merges"]]
                # Rounding can only change a decision where the exact costs tie (or lie within 1e-9 of each other): that is named, not failed.
                tied = near_tie(other_work[4]) is not None
                entry["trendRounding"] = {"sameDecisions": same, "exactNearTie": tied}
                if not same and not tied:
                    mismatches.append(f"{case['id']}: rounding the trend's leftovers to doubles changed the kinds, and the exact costs do not tie")
            tie = near_tie(lowest)
            if tie:
                entry["scipy"] = {"status": "skipped", "nearTie": tie}
                skipped.append({"case": case["id"], **tie})
            else:
                differs = scipy_check(p, w, merges, states)
                entry["scipy"] = {"status": "matched" if not differs else "differs", "joins": len(merges), "cuts": [2, 3, 4]}
                (checked if not differs else mismatches).append(case["id"] if not differs else f"{case['id']}: SciPy differs at {', '.join(differs)}")
        results.append(entry)
    if mismatches:
        print("NOT WRITTEN, a disagreement:", *mismatches, sep="\n  ")
        sys.exit(1)
    import numpy as np
    import scipy

    refused = {}
    for e in results:
        if "refused" in e["result"]:
            refused[e["result"]["refused"]] = refused.get(e["result"]["refused"], 0) + 1
    out = {
        "version": VERSION,
        "script": hashlib.sha256((here / "look-alike.py").read_bytes()).hexdigest(),
        "tools": {"numpy": np.__version__, "scipy": scipy.__version__},
        "seed": SEED,
        "nearTie": "at some step of Ward's method the two smallest costs of joining two kinds are equal, or differ by less than 1e-9 of the smaller",
        "scipy": {"checked": checked, "skipped": skipped, "cutsMatched": 3 * len(checked)},
        "trendRounding": {"cases": [e["id"] for e in results if e.get("trendRounding")], "changedAtATie": [e["id"] for e in results if e.get("trendRounding") and not e["trendRounding"]["sameDecisions"]]},
        "refusals": refused,
        "cases": [{**c, "expected": r} for c, r in zip(cases, results)],
    }
    (here / "look-alike.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{len(cases)} cases; {sum(refused.values())} refused {refused}; SciPy matched {len(checked)} cases ({3 * len(checked)} cuts, all joins), skipped {len(skipped)} near ties:")
    for s in skipped:
        print("  ", s["case"], "step", s["step"])



if __name__ == "__main__":
    main()
