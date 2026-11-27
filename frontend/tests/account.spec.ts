import { expect, test } from "@playwright/test";

test("an account keeps the board across browsers and can be deleted", async ({ browser }) => {
  const email = `synthetic-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const first = await browser.newPage();
  await first.goto("/applications/");
  await first.getByRole("button", { name: "Load example board", exact: true }).click();
  await expect(first.locator(".application-card")).toHaveCount(3);

  await first.goto("/account/");
  await first.getByRole("tab", { name: "Create account" }).click();
  await first.getByLabel("Email").fill(email);
  await first.getByLabel("Password").fill("synthetic password 1");
  await first.locator("form").getByRole("button", { name: "Create account" }).click();
  await expect(first.getByRole("status")).toContainText("Account created");
  await expect(first.getByText("Saved to your account")).toBeVisible();

  // A fresh browser context has no local data; signing in restores the board.
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.goto("/account/");
  await second.getByLabel("Email").fill(email);
  await second.getByLabel("Password").fill("synthetic password 1");
  await second.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(second.getByRole("status")).toContainText("Signed in");
  await second.goto("/applications/");
  await expect(second.locator(".application-card")).toHaveCount(3);

  await second.goto("/account/");
  await second.getByRole("button", { name: "Delete account" }).click();
  await second.getByRole("button", { name: "Delete permanently" }).click();
  await expect(second.getByRole("status")).toContainText("deleted");
  await expect(second.getByRole("heading", { level: 1 })).toContainText("Sign in");
  await context.close();
});
