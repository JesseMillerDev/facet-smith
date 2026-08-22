import type { ComponentProps } from "react";
import { createClientExperiment } from "../src";

const Mixed = createClientExperiment({
  id: "mixed-props",
  iteration: "launch-1",
  defaultVariant: "alpha",
  variants: {
    alpha: { revision: "1", component: ({ a }: { a: string }) => <>{a}</> },
    beta: { revision: "1", component: ({ b }: { b: number }) => <>{b}</> },
  },
  allocation: { alpha: 0.5, beta: 0.5 },
});

type MixedProps = ComponentProps<typeof Mixed>;
void Mixed;
const safeMixedProps: MixedProps = { a: "required", b: 1 };
// @ts-expect-error Every assigned variant must be callable with these props.
const unsafeAlphaOnly: MixedProps = { a: "missing beta props" };
// @ts-expect-error Every assigned variant must be callable with these props.
const unsafeBetaOnly: MixedProps = { b: 1 };
void [safeMixedProps, unsafeAlphaOnly, unsafeBetaOnly];

interface SharedProps {
  readonly name: string;
}

const Explicit = createClientExperiment<SharedProps>()({
  id: "explicit-props",
  iteration: "launch-1",
  defaultVariant: "control",
  variants: {
    control: {
      revision: "1",
      component: ({ name }: SharedProps) => <p>{name}</p>,
    },
    treatment: {
      revision: "1",
      component: ({ name }: SharedProps) => <h1>{name}</h1>,
    },
  },
  allocation: { control: 0.5, treatment: 0.5 },
});

const explicitProps: ComponentProps<typeof Explicit> = { name: "Ada" };
void Explicit;
// @ts-expect-error The explicit shared contract requires name.
const missingExplicitProps: ComponentProps<typeof Explicit> = {};
void [explicitProps, missingExplicitProps];
