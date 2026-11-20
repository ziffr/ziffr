---
"@ziffr/web": patch
---

Target labels no longer read as opposites. The chip says what is wrong: **Too high** for a Metric where lower is better, **Too low** where higher is better (a range with no better side keeps Above and Below target). Where Attainment would be below 0 %, the strip shows the gap instead, such as "6.5 pts below target".
