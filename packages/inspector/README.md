# `@facet-smith/inspector`

Optional, portal-rendered development UI for inspecting and overriding mounted [FacetSmith](https://github.com/JesseMillerDev/facet-smith) experiments.

## Install

```bash
pnpm add -D @facet-smith/inspector
```

Load the inspector behind a build-time condition so production bundles can omit it:

```tsx
const Inspector = inspectorBuildEnabled
  ? dynamic(
      () =>
        import("@facet-smith/inspector").then(
          (module) => module.ExperimentInspector,
        ),
      { ssr: false },
    )
  : undefined;
```

Pass the component through `ExperimentProvider` only in explicitly enabled non-production environments. The inspector supports outlines, nested experiments, variant switching, reset, URL sharing, local persistence, and keyboard-accessible controls.

The inspector is disabled by default. A declared `production` environment keeps it disabled unless the application uses the explicit `allowInProduction` escape hatch. See the [inspector guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/inspector.md) for safe configuration and override precedence.
