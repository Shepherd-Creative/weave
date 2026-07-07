---
"@shepherd-creative/weave-skill": minor
"@shepherd-creative/weave-mcp-server": patch
---

Proactive visuals guidance: render dashboards when an answer is data-shaped instead of waiting to be asked.

The composition skill gains a "When to visualise unprompted" section (§1.1): render the moment an answer turns data-shaped, before committing it to prose. It carries a per-primitive threshold table, a litmus test (if your prose draft holds a markdown table or a list of figures, render it) and counter-heuristics that keep single scalars, prose questions and mid-conversation clarifications in chat. A closing note flags that host brand guidance may sharpen the thresholds at runtime. The section widens only *when* the model reaches for Weave, never *what* it may emit: the no-CSS, no-colours, no-pixels contract is restated, not relaxed.

Each of the five `render_*` tool descriptions gains one proactive cue so the nudge also reaches a model that never calls `get_skill` (prefer `render_metric_band` over a prose list of three or more KPIs, `render_table_card` over a markdown table, `render_chart_card` when describing a trend and `render_dashboard` for a multi-dimensional status summary; `render_note_card` stays reserved for annotating a rendered dashboard rather than duplicating prose). Description text only, no schema or behaviour change.
