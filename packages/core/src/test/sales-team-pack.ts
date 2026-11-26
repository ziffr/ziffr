// A Pack for tests of spec 0058: a weekly sales forecast with one set of Metrics per salesperson (a Repeat), a Sales
// lead who stands in, approves and is shared with, and people who only get the Snapshot (GLOSSARY: Pack, Position,
// Repeat).
import type { Pack } from "../pack";

const money = { format: "ziffr.metric/1" as const, period: "week" as const, aggregation: "last" as const, polarity: "higher" as const, unit: "€", unitPosition: "after" as const, valueFormat: "currency" as const, decimals: 0 };

/** The sales team's Pack, as a file would hold it. */
export const SALES_TEAM: Pack = {
  format: "ziffr.pack/2",
  id: "ziffr/sales-team-test",
  name: "Sales team",
  version: "1.0.0",
  summary: "A weekly forecast with figures for each salesperson.",
  author: { name: "Ziffr" },
  license: "CC-BY-4.0",
  positions: [
    { key: "lead", name: "Sales lead", people: "one" },
    { key: "observers", name: "Observers", people: "several" },
    { key: "seller", name: "Salesperson", people: "one", per: "rep" },
  ],
  repeats: [{ key: "rep", name: "Salesperson", max: 12 }],
  contents: {
    metrics: [
      { key: "commit", per: "rep", submitters: ["seller"], standIn: "lead", viewers: ["lead"], metric: { ...money, name: "Commit" } },
      { key: "quota", submitters: ["lead"], viewers: ["observers"], metric: { ...money, name: "Team quota" } },
      { key: "gap", per: "rep", viewers: ["seller"], metric: { ...money, name: "Gap", aggregation: "none", formula: "{commit} - {quota}" } },
    ],
    dashboards: [
      { key: "team", viewers: ["lead", "observers"], template: { format: "ziffr.dashboard-template/1", name: "Team forecast", slots: [{ label: "Commit", multiple: true, suggests: "commit" }, { label: "Quota", suggests: "quota" }], widgets: [{ view: "line", slots: [0], x: 0, y: 0, w: 8, h: 6 }, { view: "number", slots: [1], x: 8, y: 0, w: 4, h: 4 }] } },
      { key: "mine", per: "rep", viewers: ["seller"], template: { format: "ziffr.dashboard-template/1", name: "My forecast", slots: [{ label: "Commit", suggests: "commit" }], widgets: [{ view: "number", slots: [0], x: 0, y: 0, w: 6, h: 4 }] } },
    ],
    workflows: [
      {
        key: "weekly",
        template: {
          format: "ziffr.workflow-template/2",
          name: "Weekly forecast",
          dueWorkingDays: 2,
          steps: [
            { type: "approve", approvers: 1, by: ["lead"] },
            { type: "checklist", kind: "info", text: "Forecast is due on Tuesday.", day: 1, to: ["seller"] },
            { type: "checklist", kind: "tick", text: "Hold the forecast meeting.", dueWorkingDays: 3, assignee: "lead" },
            { type: "tell", condition: { kind: "share_of_target", share: "90" }, to: ["lead"] },
            { type: "send_snapshot", dashboard: "team", to: ["observers"] },
            { type: "publish", lock: true },
          ],
        },
      },
    ],
  },
};

/** The Pack as a file's text. */
export const salesTeamText = () => JSON.stringify(SALES_TEAM);
