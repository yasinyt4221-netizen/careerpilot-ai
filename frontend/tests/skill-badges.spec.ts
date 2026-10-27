import { expect, test } from "@playwright/test";
import path from "node:path";
import { evidenceState } from "../app/components/skill-requirements";

const fixture = path.resolve("../backend/.test-fixtures/review.docx");
const CV = "Projects\nQueried PostgreSQL to combine customer records.\nSkills\nPython";
const JOB = "Junior Data Analyst\nRequired:\nSQL and Python\nPreferred:\nKubernetes";

test("badges never label absent or listed evidence as demonstrated", () => {
  expect(evidenceState("matched", "inferred", "Queried PostgreSQL.")).toBe("found");
  expect(evidenceState("matched", "mentioned", "Python")).toBe("listed");
  expect(evidenceState("matched", undefined, null)).toBe("missing");
  expect(evidenceState("related", "related", "Created charts.")).toBe("related");
  expect(evidenceState("not_found", "not_found", null)).toBe("missing");
});

test("job skills show found, listed and missing badges with grounded next actions", async ({ page }) => {
  await page.route("**/api/cvs/extract", route => route.fulfill({ json: { extracted_text: CV, filename: "synthetic.docx" } }));
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  const skills = page.getByRole("region", { name: "What they're looking for", exact: true });
  await expect(skills.getByRole("button", { name: "SQL: Found in CV", exact: true })).toBeVisible();
  await expect(skills.getByRole("button", { name: "Python: Listed only", exact: true })).toBeVisible();
  const missing = skills.getByRole("button", { name: "Kubernetes: Not shown in CV", exact: true });
  await missing.focus();
  await page.keyboard.press("Enter");
  await expect(missing).toHaveAttribute("aria-expanded", "true");
  await expect(skills.locator(".skill-check-detail")).toContainText("No supporting passage");
  await expect(skills.locator(".skill-next-action")).toContainText("Projects or Experience");
  await expect(skills.locator(".skill-next-action")).toContainText("leave it off your CV");
  await skills.getByRole("button", { name: "See what to change", exact: true }).click();
  await expect(page.getByTestId("gap-card").filter({ has: page.getByRole("button", { name: /Kubernetes/ }) })).toHaveClass(/selected/);
  await skills.getByRole("button", { name: "SQL: Found in CV", exact: true }).click();
  await expect(skills.locator("blockquote")).toContainText("Queried PostgreSQL to combine customer records.");
  await skills.getByRole("button", { name: "Update CV", exact: true }).click();
  await expect(page.getByLabel("Job description", { exact: true })).toBeVisible();
});

test("skill badges wrap on a phone and don't convert learning into experience", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/cvs/extract", route => route.fulfill({ json: { extracted_text: "Student\nCurrently learning Python.\nProjects\nCreated charts for a class project.", filename: "synthetic.docx" } }));
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("button", { name: "Python: Not shown in CV", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("skills from one advert line open their own missing-skill recommendation", async ({ page }) => {
  await page.route("**/api/cvs/extract", route => route.fulfill({ json: { extracted_text: "Student\nProjects\nCreated a presentation for a class project.", filename: "synthetic.docx" } }));
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  const skills = page.getByRole("region", { name: "What they're looking for", exact: true });
  await skills.getByRole("button", { name: "Python: Not shown in CV", exact: true }).click();
  await skills.getByRole("button", { name: "See what to change", exact: true }).click();
  await expect(page.locator('.gap.recommendation.selected').getByRole("button", { name: /Python/ })).toBeVisible();
});
