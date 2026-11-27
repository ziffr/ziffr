// What the clean slate's screens of First Steps are drawn from (spec 0067; GLOSSARY: First Steps, Metric Catalog),
// read and picked on the server. The suggestions for a team follow the Owner's own Business Function and the
// Workspace's industry and segment; those for someone alone are sent for every topic, as the topic stays in the
// browser. Only the few suggested entries go there, each with its name, sentence and how often.
import type { Actor } from "@ziffr/core/actor";
import { firstStepsMetric } from "@ziffr/core/first-steps-metric";
import { TOPICS, type FirstStepsAnswers, type Topic } from "@ziffr/core/first-steps-screens";
import { metricCatalog } from "@ziffr/core/page-data";
import type { CatalogMetric } from "@ziffr/core/types";
import { HOW_OFTEN, suggestForTopic, suggestMetrics, type Suggestion } from "@/lib/metric-suggestions";
import type { FirstStepsClean, FirstStepsOffer } from "./screens/types";

/** How many suggestions First Steps offers a team. */
const OFFERED = 5;

const offer = ({ entry, line }: Suggestion): FirstStepsOffer => ({ id: entry.id, name: entry.name, line, often: HOW_OFTEN[entry.period] });

/** The first Metric's name, if there is one, and the suggestions, for the Workspace's Owner. */
export async function cleanSlate(actor: Actor, answers: FirstStepsAnswers): Promise<FirstStepsClean> {
  const [metric, catalog] = await Promise.all([firstStepsMetric(actor), metricCatalog(actor)]);
  const items = catalog as unknown as CatalogMetric[];
  return {
    metricName: metric?.name ?? null,
    team: suggestMetrics(items, { function: answers.role, industry: answers.industry, segment: answers.segment, team: true }, OFFERED).map(offer),
    topics: Object.fromEntries(TOPICS.map((t) => [t, suggestForTopic(items, t).map(offer)])) as Record<Topic, FirstStepsOffer[]>,
  };
}
