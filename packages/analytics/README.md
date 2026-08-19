# `@facet-smith/analytics`

Vendor-neutral exposure events and development/testing adapters for [FacetSmith](https://github.com/JesseMillerDev/facet-smith).

## Install

```bash
pnpm add @facet-smith/analytics
```

## Example

```ts
import {
  createConsoleAnalyticsAdapter,
  type ExperimentAnalyticsAdapter,
} from "@facet-smith/analytics";

const developmentAdapter = createConsoleAnalyticsAdapter();

const productionAdapter: ExperimentAnalyticsAdapter = {
  exposure(event) {
    return analytics.capture("experiment_exposure", event);
  },
};
```

The package also exports a no-op adapter and `InMemoryAnalyticsAdapter` for tests. Assignment and exposure are intentionally separate: applications should report exposure only after experimental content becomes visible.

FacetSmith does not provide statistical inference or an analytics backend. See the [analytics guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/analytics.md) for event fields and adapter guidance.
