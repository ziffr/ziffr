// Planner tasks whose title leads with a Ziffr ref ("[ZIF-12] ..."); their notes are read next, and must name the same ref.
const res = $input.first().json;
const all = res.value || [];
const mine = all.map((t) => ({ t, m: /^\[([A-Za-z0-9]+-\d+)\] /.exec(String(t.title || '')) })).filter((x) => x.m);
const whole = all.length < 100 && !res['@odata.nextLink'] && mine.length <= 40;
return mine.slice(0, 40).map((x) => ({ json: { id: x.t.id, ref: x.m[1], done: x.t.percentComplete === 100, whole } }));
