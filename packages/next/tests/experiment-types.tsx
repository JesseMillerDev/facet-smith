import { createNextExperiment } from "../src/server";

const Mixed = createNextExperiment({
  id: "mixed-server-props",
  iteration: "launch-1",
  defaultVariant: "alpha",
  variants: {
    alpha: { revision: "1", component: async ({ a }: { a: string }) => a },
    beta: { revision: "1", component: async ({ b }: { b: number }) => b },
  },
  allocation: { alpha: 0.5, beta: 0.5 },
});

void Mixed.render({ a: "required", b: 1 });
// @ts-expect-error Every assigned server variant must accept these props.
void Mixed.render({ a: "missing beta props" });
// @ts-expect-error Every assigned server variant must accept these props.
void Mixed.render({ b: 1 });

interface SharedProps {
  readonly name: string;
}

const Explicit = createNextExperiment<SharedProps>()({
  id: "explicit-server-props",
  iteration: "launch-1",
  defaultVariant: "control",
  variants: {
    control: {
      revision: "1",
      component: async ({ name }: SharedProps) => name,
    },
    treatment: {
      revision: "1",
      component: async ({ name }: SharedProps) => name,
    },
  },
  allocation: { control: 0.5, treatment: 0.5 },
});

void Explicit.render({ name: "Ada" });
// @ts-expect-error The explicit shared contract requires name.
void Explicit.render({});
