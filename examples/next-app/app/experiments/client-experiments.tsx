"use client";

import { createClientExperiment } from "@facet-smith/react";

export interface HeroProps {
  readonly title: string;
}

const Confidence = createClientExperiment({
  id: "confidence-note",
  defaultVariant: "numbers",
  variants: {
    numbers: {
      revision: "1",
      component: () => (
        <p className="confidence">Trusted by 1,200 product teams.</p>
      ),
    },
    promise: {
      revision: "1",
      component: () => (
        <p className="confidence">No credit card. Cancel whenever you like.</p>
      ),
    },
  },
  allocation: { numbers: 0.5, promise: 0.5 },
});

function Control({ title }: HeroProps) {
  return (
    <section
      className="hero hero-control"
      data-testid="client-variant"
      data-variant="control"
    >
      <span className="eyebrow">Client experiment</span>
      <h1>{title}</h1>
      <p>
        Run trustworthy source-native experiments without giving up your
        component system.
      </p>
      <a className="primary" href="#demo">
        Explore the runtime
      </a>
      <Confidence />
    </section>
  );
}

function Concise({ title }: HeroProps) {
  return (
    <section
      className="hero hero-concise"
      data-testid="client-variant"
      data-variant="concise"
    >
      <span className="eyebrow">Client experiment · concise</span>
      <h1>{title}, confidently.</h1>
      <div className="hero-row">
        <p>Typed variants. Stable assignment. Actual exposure.</p>
        <a className="primary" href="#demo">
          See it work
        </a>
      </div>
      <Confidence />
    </section>
  );
}

function Split({ title }: HeroProps) {
  return (
    <section
      className="hero hero-split"
      data-testid="client-variant"
      data-variant="split"
    >
      <div>
        <span className="eyebrow">Client experiment · split</span>
        <h1>{title}</h1>
      </div>
      <div>
        <p>
          Your variants stay as reviewable React source files, with immutable
          analytics IDs.
        </p>
        <a className="primary" href="#demo">
          Inspect variants
        </a>
        <Confidence />
      </div>
    </section>
  );
}

export const PricingHero = createClientExperiment({
  id: "pricing-hero",
  defaultVariant: "control",
  variants: {
    control: { component: Control, revision: "1" },
    concise: { component: Concise, revision: "1" },
    split: { component: Split, revision: "1" },
  },
  allocation: { control: 0.34, concise: 0.33, split: 0.33 },
  salt: "example-v1",
});
