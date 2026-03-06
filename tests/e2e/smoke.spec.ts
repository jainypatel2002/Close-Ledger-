import { expect, test } from "@playwright/test";

test("guest gets redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Nightly Closing" })).toBeVisible();
});
