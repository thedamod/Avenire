---
type: research
status: active
tags:
  - research
  - memory-science
  - spaced-repetition
  - avenire
created: 2026-02-18
updated: 2026-02-18
domain: learning-science
question: How does FSRS model memory and outperform SM-2 in review scheduling?
---
# FSRS (Free Spaced Repetition Scheduler)

> [!summary]
> FSRS is a data-driven spaced repetition scheduler that models memory using Difficulty, Stability, and Retrievability (DSR), then sets intervals to hit a target recall probability.

## Research Question
- How does FSRS estimate recall probability and personalize review intervals compared with heuristic schedulers like SM-2?

## Hypothesis / Intuition
- A probabilistic memory model fitted on real review logs should reduce total review load while maintaining or improving retention.

## Key Sources
- FSRS implementation and documentation in the Anki ecosystem
- Practitioner benchmarks comparing FSRS and SM-2
- Memory modeling literature on forgetting curves and retention prediction

## Notes & Insights

### Background
- Legacy schedulers (for example, SM-2) rely on heuristics: ease-factor updates, discrete outcomes, and fixed interval growth.
- These approaches are simple, but weaker at personalization and probabilistic prediction.
- FSRS reframes scheduling as a predictive modeling problem.

### Core Model (DSR)
- `Difficulty (D)`: intrinsic card difficulty.
- `Stability (S)`: how long the memory is expected to remain retrievable.
- `Retrievability (R)`: probability of recall at elapsed time `t`.

Forgetting curve used in FSRS-style modeling:

$$
R(t) = e^{-t/S}
$$

Where:
- `t` is elapsed time since last review.
- `S` is current memory stability.

### Update Dynamics
- Inputs per review: elapsed time, current `D/S/R` state, and rating (`Again`, `Hard`, `Good`, `Easy`).

Conceptual stability update:

$$
S' =
\begin{cases}
S \cdot (1 + f(D, R)) & \text{if recall succeeds} \\
g(D) & \text{if recall fails}
\end{cases}
$$

Conceptual difficulty update:

$$
D' = D + \alpha(\text{rating})
$$

### Parameter Optimization
- FSRS learns parameters from review logs instead of using fixed constants.
- Typical training flow:
1. Collect review events (`timestamp`, `rating`, prior interval).
2. Predict recall probability for each event.
3. Minimize prediction error with gradient-based optimization (for example, Adam).

Objective (conceptual):

$$
\min \sum_i (\hat{R}_i - y_i)^2
$$

Where:
- `\hat{R}_i` is predicted recall probability.
- `y_i` is observed recall outcome (`0` or `1`).

### Scheduling Policy
- Choose next interval `t` such that:

$$
R(t) = R_{\text{target}}
$$

- Solving gives:

$$
t = -S \ln(R_{\text{target}})
$$

- A common target is `R_target ≈ 0.9`.

### Empirical Takeaways
- Reported practical benefits over SM-2:
- Lower daily reviews at similar retention levels
- Better adaptation across varying card difficulty
- More robust recovery after lapses
- Community benchmarks often report roughly 10-30% review reduction (context dependent)

## Experiments / Prototypes
- Build an FSRS scheduler prototype in Avenire with configurable `R_target`.
- Log per-review features (`D`, `S`, `R`, rating, response latency).
- Run an A/B test:
1. Arm A: SM-2-like heuristic scheduler
2. Arm B: FSRS-based scheduler
- Compare retention, reviews/day, and time-to-mastery.

## Open Questions
- How well does exponential decay fit different learning content types?
- What minimum event volume is needed for stable per-user parameter fitting?
- Should parameter fitting be user-level, cohort-level, or hybrid?
- Which contextual features (fatigue, topic complexity, session length) meaningfully improve predictions?

## Implications
- FSRS aligns with Avenire's strategy to prioritize adaptive cognition over static content delivery.
- Personalized scheduling can reduce learner workload while improving confidence and continuity.
- Production use requires strong telemetry, retraining cadence, and model monitoring.

## Related Notes
- [[DL-01.2 — Personalized Explanations over Content Libraries]]
- [[DL-02.1 — Structured AI Harness over Prompt Router]]
- [[DL-03.1 — Subscription Pricing over Usage Pricing]]
