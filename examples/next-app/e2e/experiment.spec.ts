import { expect, test } from "@playwright/test";
import {
  EXPERIMENT_MARKER_ATTRIBUTES,
  experimentMarkerSelector,
} from "@facet-smith/react";

test("stable assignment, inspector switching, sharing, reset, and hydration", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  const client = page.getByTestId("client-variant");
  const firstClientVariant = await client.getAttribute("data-variant");
  await page.reload();
  await expect(client).toHaveAttribute(
    "data-variant",
    firstClientVariant ?? "",
  );
  await expect(page.getByLabel("FacetSmith toolbar")).toContainText(
    "3 mounted experiments",
  );
  const pricingBadge = page.getByRole("button", {
    name: new RegExp(`Inspect pricing-hero, variant ${firstClientVariant}`),
  });
  const badgeBox = await pricingBadge.boundingBox();
  const viewport = page.viewportSize();
  expect(badgeBox).not.toBeNull();
  expect(badgeBox?.x).toBeGreaterThanOrEqual(0);
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? Number.MAX_SAFE_INTEGER,
  );

  await page
    .getByRole("button", {
      name: new RegExp(`pricing-hero · ${firstClientVariant}`),
    })
    .click();
  const popover = page.getByRole("dialog", {
    name: "Variants for pricing-hero",
  });
  const popoverBox = await popover.boundingBox();
  expect((popoverBox?.x ?? 0) + (popoverBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? Number.MAX_SAFE_INTEGER,
  );
  const clientTarget = firstClientVariant === "concise" ? "split" : "concise";
  await page
    .getByRole("button", { name: new RegExp(`^${clientTarget} revision`) })
    .click();
  await expect(client).toHaveAttribute("data-variant", clientTarget);

  const server = page.getByTestId("server-variant");
  await expect(
    page.locator(experimentMarkerSelector("server-card")),
  ).toHaveAttribute(EXPERIMENT_MARKER_ATTRIBUTES.revision, "1");
  const initialServer = await server.getAttribute("data-variant");
  await page
    .getByRole("button", { name: new RegExp(`server-card · ${initialServer}`) })
    .click();
  const serverTarget =
    initialServer === "technical" ? "narrative" : "technical";
  await page
    .getByRole("button", { name: new RegExp(`^${serverTarget} revision`) })
    .click();
  await expect(server).toHaveAttribute("data-variant", serverTarget);
  await page.reload();
  await expect(server).toHaveAttribute("data-variant", serverTarget);

  await page.getByRole("button", { name: "Copy current URL" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("__exp=");
  await page.goto(copied);
  await expect(client).toHaveAttribute("data-variant", clientTarget);
  await expect(server).toHaveAttribute("data-variant", serverTarget);

  await page.getByRole("button", { name: "Reset all" }).click();
  await expect.poll(() => page.url()).not.toContain("__exp=");
  await expect(server).not.toHaveAttribute("data-variant", serverTarget);
  expect(consoleErrors).toEqual([]);
});

test("disabled inspector is absent", async ({ page }) => {
  await page.goto("/disabled?__exp=pricing-hero:concise");
  await expect(page.getByTestId("client-variant")).toBeVisible();
  await expect(page.getByLabel("FacetSmith toolbar")).toHaveCount(0);
  await expect(page.locator("[data-experiment-inspector]")).toHaveCount(0);
});
