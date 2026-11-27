import { expect, test } from "@playwright/test";
import path from "node:path";

const JOB = "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes";

test("review opens on a short analysis and a full, editable, copyable improved CV", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(path.resolve("../backend/.test-fixtures", "review.docx"));
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();

  await expect(page.getByRole("tab", { name: "Improved CV" })).toHaveAttribute("aria-selected", "true");
  const analysis = page.getByRole("region", { name: "Analysis" });
  await expect(analysis).toContainText("The role");
  await expect(analysis).toContainText("Kubernetes");
  expect((await analysis.innerText()).split(/\s+/).length).toBeLessThan(110);

  // The spelling fix is already applied in the copyable text; the original typo is gone.
  const sections = page.getByRole("region", { name: "Your improved CV" }).locator("textarea");
  await expect(sections.first()).toBeVisible();
  const all = (await sections.evaluateAll(nodes => nodes.map(node => (node as HTMLTextAreaElement).value))).join("\n");
  expect(all).toContain("Experience in reporting");
  expect(all).not.toContain("Experiance");

  const first = sections.first();
  await first.fill("Edited header");
  await page.getByRole("button", { name: "Copy full CV" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Edited header");

  // Job matching is offered right under the review, with portal searches prefilled from the role.
  await expect(page.getByRole("button", { name: "Find roles for my CV" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Handshake · ARU" })).toHaveAttribute("href", /query=Data\+Analyst/);
  await expect(page.getByRole("link", { name: "GOV.UK Find a job" })).toHaveAttribute("href", /q=Data\+Analyst/);
});
