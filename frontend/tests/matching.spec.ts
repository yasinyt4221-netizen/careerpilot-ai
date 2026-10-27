import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const JOB = "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes";
const fixture = (name = "review.docx") => path.resolve("../backend/.test-fixtures", name);

async function analyse(page: Page, file = "review.docx") {
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture(file));
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => { await page.goto("/workspace/"); });

test("a single analysis produces highlights and concrete instructions without scoring jargon", async ({ page }) => {
  const api = page.waitForResponse(response => response.url().endsWith("/api/matches/compare"));
  await analyse(page);
  const response = await api;
  expect(response.status()).toBe(200);
  const report = await response.json();
  if (process.env.REQUIRE_HYBRID === "1") expect(report.mode).toBe("hybrid");
  await expect(page.locator(".cv-highlight")).not.toHaveCount(0);
  const body = await page.getByRole("main").innerText();
  expect(body).not.toMatch(/semantic|cosine|hybrid|rules weight|60%|40%|scoring weight/i);
  await expect(page.getByRole("button", { name: "Apply change", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your CV against this role" })).toHaveCount(0);
});

test("clicking a highlighted passage opens its exact recommendation", async ({ page }) => {
  await analyse(page);
  await page.getByTestId("cv-preview").getByRole("button", { name: /Explain what your reporting work/ }).click();
  const active = page.locator(".recommendation.selected");
  await expect(active).toContainText("Built a reporting dashboard.");
  await expect(active).toContainText("Edit in");
  await expect(active).toContainText("who used it");
  await expect(active).toContainText("The detail this line needs", { ignoreCase: true });
  await expect(active.getByRole("button", { name: "Edit this passage" })).toBeVisible();
});

test("spelling fix works after an emoji, rechecks highlights, and can be undone", async ({ page }) => {
  await analyse(page);
  await page.getByTestId("cv-preview").getByRole("button", { name: /Change.*Experiance.*Experience/ }).click();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experience in reporting");
  await expect(page.getByTestId("cv-preview")).not.toContainText("Experiance");
  await expect(page.getByRole("button", { name: "Undo last edit" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo last edit" }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experiance in reporting");
  await expect(page.getByTestId("cv-preview").getByRole("button", { name: /Change.*Experiance/ })).toBeVisible();
});

test("applicant can edit an exact passage and placeholders cannot be applied", async ({ page }) => {
  await analyse(page);
  await page.getByTestId("cv-preview").getByRole("button", { name: /Explain what your reporting work/ }).click();
  await page.getByRole("button", { name: "Edit this passage" }).click();
  await page.getByLabel("Your revised wording").fill("Built a reporting dashboard for [actual users].");
  await expect(page.getByRole("button", { name: "Update preview" })).toBeDisabled();
  await page.getByLabel("Your revised wording").fill("Built a reporting dashboard in SQL for the finance team to review monthly costs.");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("in SQL for the finance team");
  await expect(page.getByTestId("cv-preview")).toContainText("Managed the the monthly reporting pack.");
});

test("a failed edit keeps the original wording and can be retried", async ({ page }) => {
  await analyse(page);
  await page.route("**/api/matches/compare", route => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Cannot reach the review service");
  await expect(page.getByTestId("cv-preview")).toContainText("Experiance");
  await expect(page.getByRole("button", { name: "Undo last edit" })).toHaveCount(0);
  await page.unroute("**/api/matches/compare");
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experience in reporting");
});

test("missing skills stay outside the highlighted text and never offer an invented replacement", async ({ page }) => {
  await analyse(page);
  const gap = page.getByTestId("gap-card").filter({ hasText: "Kubernetes" });
  await gap.getByRole("button").click();
  await expect(gap).toContainText("If you have used Kubernetes");
  await expect(gap).toContainText("do not add this claim");
  await expect(gap.getByRole("button", { name: "Apply change" })).toHaveCount(0);
  await expect(page.getByTestId("cv-preview")).not.toContainText("Kubernetes");
});

test("changing job text or CV clears old suggestions and retains the advert", async ({ page }) => {
  await analyse(page);
  await page.getByRole("button", { name: "Change CV or job" }).click();
  await page.getByLabel("Job description", { exact: true }).fill(JOB + "\nDocker");
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change CV or job" }).click();
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture("synthetic.pdf"));
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(JOB + "\nDocker");
});

test("cancelled analysis cannot populate stale highlights", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/matches/compare", async route => { await pending; await route.fulfill({ json: {} }).catch(() => undefined); });
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture());
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Finding useful changes");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Analyse my CV", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toHaveCount(0);
});

test("no recognised job requirements explains what to paste instead", async ({ page }) => {
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture());
  await page.getByLabel("Job description", { exact: true }).fill("Welcome to our friendly company and wonderful workplace.");
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toContainText("Paste its responsibilities and qualifications");
});

test("rejects a review with invalid highlight offsets", async ({ page }) => {
  await page.route("**/api/matches/compare", async route => {
    const response = await route.fetch(); const data = await response.json();
    data.review.changes[0].start = 999999;
    await route.fulfill({ json: data });
  });
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture());
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("unexpected response");
});

test("mobile review stays within the viewport and highlights open recommendations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await analyse(page);
  await page.getByTestId("cv-preview").getByRole("button", { name: /Remove the repeated/ }).click();
  await expect(page.getByRole("button", { name: "Apply change", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
