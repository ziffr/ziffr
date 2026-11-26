// A Pack's Positions, Repeats and proposed Shares as the Packs page shows them, before and after installing (spec 0058,
// GLOSSARY: Position, Repeat, Share, Pack). The core says each in words; everything is the Pack's own text, shown as
// text.
import type { PackPeople } from "@ziffr/core/pack-places";

const card = "rounded-[var(--radius-input)] border border-input p-2.5 [overflow-wrap:anywhere]";
const heading = "mb-1.5 text-xs font-medium";

/** What a Pack's Positions do, what Set up makes once per line and every Share the Pack proposes. */
export function PackPeopleList({ people }: { people: PackPeople }) {
  return (
    <div className="space-y-4">
      {people.repeats.length > 0 && (
        <div>
          <h3 className={heading}>Made once for each line of a list (Repeats)</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {people.repeats.map((r) => (
              <li key={r.name} className={card}>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">You list each &ldquo;{r.name}&rdquo; at Set up, at most {r.max}. Each line gets:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {r.makes.map((m) => <li key={m}>{m}</li>)}
                  {r.positions.length > 0 && <li>Its own {r.positions.join(", ")}</li>}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {people.positions.length > 0 && (
        <div>
          <h3 className={heading}>Who does what (Positions) <span className="fig text-muted-foreground">{people.positions.length}</span></h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {people.positions.map((p) => (
              <li key={p.name} className={card}>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.several ? "Several people" : "One person"}{p.each ? ` for each ${p.each}` : ""}</p>
                {p.does.length > 0
                  ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">{p.does.map((line, i) => <li key={i}>{line}</li>)}</ul>
                  : <p className="mt-1 text-xs">Has no task of its own.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {people.shares.length > 0 && (
        <div>
          <h3 className={heading}>Shares it proposes</h3>
          <p className="text-xs text-muted-foreground">Installing shares nothing and sends nothing.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs [overflow-wrap:anywhere]">
            {people.shares.map((s) => (
              <li key={`${s.position} ${s.role}`}>
                <span className="font-medium">{s.position}</span> as {s.role} of {[
                  s.metrics.length ? `the Metric${s.metrics.length === 1 ? "" : "s"} ${s.metrics.join(", ")}` : "",
                  s.dashboards.length ? `the dashboard${s.dashboards.length === 1 ? "" : "s"} ${s.dashboards.join(", ")}` : "",
                ].filter(Boolean).join(" and ")}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
