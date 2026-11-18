---
"@ziffr/web": minor
---

Attainment can be computed two ways: by ratio (value ÷ target, target ÷ value when lower is better), as before, or by distance to the target in steps of its size, which reads the same in every direction and works for targets below 0. Owners and Admins set the Workspace's method on Workspace → General, and each Metric can choose its own under Edit details. Every existing Workspace keeps computing by ratio, so nothing changes until someone picks distance. The tooltip on an Attainment names its method, and Snapshots and frozen View Links keep the method they were made with. Developers: API and SDK Metrics carry `attainment_method`.
