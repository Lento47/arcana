---
tags: [arcana, tui, mistake, requirements]
date: 2026-08-29
source: ses_fb3f84929ffenopd0YzUdH5nU9
---
# built without confirming requirements

The assistant built a full Gantt dashboard component before confirming the user actually wanted it.

After the user requested 'a gantt timeline dashboardin TUI,' the assistant proceeded to explore patterns and build the full component without first confirming scope, data sources, or whether the user wanted a Gantt chart specifically vs. another timeline visualization. The user rejected the entire implementation. **How to apply:** Always confirm requirements, scope, and desired output format before building significant features — especially when requests are ambiguous.
