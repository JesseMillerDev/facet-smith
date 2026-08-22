# Your A/B test has two versions. You are probably tracking only one.

Most experimentation systems give a test a name and its treatments a set of labels: `checkout-copy`, `control`, `short`, `long`.

That looks like enough identity until the test changes.

Someone adjusts the traffic split. Targeting expands from new customers to everyone. A salt changes and the population is rebucketed. The "short" treatment gets a bug fix that also changes its behavior. The dashboard still shows the same experiment and variant names, so the observations continue accumulating in the same rows.

The labels survived. The experiment did not.

An experiment needs two independent version numbers: one for the assignment regime and one for the treatment implementation. I call them **iteration** and **revision**.

## Iteration identifies the run

An iteration answers this question:

> Under which assignment rules did this subject enter the experiment?

Start a new iteration whenever any input to assignment changes:

- allocation or coverage;
- salt or hashing behavior;
- eligibility or targeting;
- randomization unit, such as user versus account;
- assignment provider or resolver behavior;
- the mapping from the source experiment to a vendor key.

These are not configuration details. They define the population being measured.

Suppose iteration 1 allocates 50% of eligible users to an experiment. Halfway through, coverage increases to 100% without changing identity. The second population entered under different conditions, and any time trend in the business now correlates with how users entered the sample. One dashboard row may still produce a precise-looking number, but it no longer describes one stable run.

A new iteration should therefore be visible everywhere: deterministic assignment, sticky-bucket keys, exposure events, manifests, and analysis. If a vendor dashboard shows two rows after the change, that is not clutter. It is the boundary that prevents two incompatible populations from being pooled.

## Revision identifies the treatment

A revision answers a different question:

> Which exact behavior did the subject have an opportunity to experience?

Increment a variant's revision whenever its traffic-exposed behavior changes. Copy, layout, interaction, business logic, and meaningful performance changes all count. Refactoring that provably preserves behavior does not need a new revision.

This identity belongs to the variant, not the whole experiment. If the control remains unchanged while the treatment changes, the control can keep its revision and the treatment advances.

Without revisions, a variant name becomes a mutable pointer. "Treatment" might mean one experience on Monday and another on Thursday, while analytics silently treats both as the same observation. Version control can reconstruct the code later, but it cannot repair an exposure event that never recorded which implementation was shown.

## The observation key needs both

The useful identity of an exposure is:

```text
(experiment ID, iteration, variant ID, revision)
```

Each field answers a separate question:

- **experiment ID:** what hypothesis was being tested?
- **iteration:** under which assignment regime?
- **variant ID:** which conceptual treatment?
- **revision:** which exact implementation of that treatment?

Dropping either version creates a different form of contamination. Dropping iteration pools incompatible populations. Dropping revision pools incompatible experiences.

## Rendering control does not make someone a control observation

Identity discipline also clarifies a common analytics error.

A subject can fail targeting, fall outside coverage, lack a stable identifier, or encounter an assignment failure. The application may still render its default component so the page remains usable. That does not mean the subject was assigned to control.

Assignment and rendering are different states. Exposure should be emitted only for an exposure-eligible assignment that actually became visible. An ineligible subject who happened to see default content must not enter the control arm, or the baseline becomes a mixture of assigned controls and everyone the experiment excluded.

This distinction is easy to lose when vendor APIs return a default value without explaining why. While integrating GrowthBook, I found that its evaluator distinguishes targeting misses from coverage exclusion internally but its public feature result currently collapses both. I opened [a proposal to expose non-assignment reasons](https://github.com/growthbook/growthbook/discussions/6737), because diagnostics should preserve that distinction even when both states correctly suppress exposure.

## Source code can enforce the identity contract

Dashboards are good at displaying results. They are a weak place to define what a treatment meant in a particular release.

When experiment definitions live with the source variants, ordinary engineering controls can protect identity:

- code review can see a behavior change without a revision bump;
- CI can compare the current definition with a committed manifest;
- typed variant IDs prevent a remote assignment from selecting nonexistent code;
- an iteration-scoped vendor key keeps sticky assignments from crossing runs;
- exposure events can carry the same immutable tuple as the implementation.

This does not require replacing an assignment or analysis platform. GrowthBook, Statsig, or an internal service can continue to own targeting and allocation. The application can own the source treatment and the exposure boundary. The important part is that both sides agree on identity.

FacetSmith is one implementation of this model for React and Next.js, but the model is more important than the framework. You can adopt it with any stack:

1. Give every assignment regime an immutable iteration.
2. Give every traffic-bearing treatment implementation an immutable revision.
3. Record both on visible exposure.
4. Never rewrite historical meaning.

An A/B test is not just a name attached to a dashboard row. It is a population-selection rule applied to a specific set of experiences. If either half changes, its identity should change with it.
