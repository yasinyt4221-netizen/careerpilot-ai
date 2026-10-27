import { chromium, expect } from "@playwright/test";

// Exercise the exported production bundle, including its GitHub Pages base path.
const browser = await chromium.launch();
const base = (process.env.RELEASE_URL || "http://127.0.0.1:3100/careerpilot-ai").replace(/\/$/, "");
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
  const errors = [];
  const documentPosts = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/(cvs|matches)/.test(request.url())) documentPosts.push(request.url());
  });
  await expect(async () => { await page.goto(base + "/"); }).toPass({ timeout: 15000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("opportunity");
  await page.getByRole("link", { name: "Get started free", exact: true }).click();
  await expect(page.getByLabel("Choose a PDF or DOCX CV")).toBeDisabled();
  await page.getByRole("button", { name: "Try the sample CV", exact: true }).click();
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experience in reporting");
  await page.getByRole("button", { name: "Undo last edit", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experiance");
  await page.getByTestId("cv-preview").getByRole("button", { name: /Explain what your reporting work/ }).click();
  await expect(page.locator(".visual-comparison")).toBeVisible();
  await page.goto(base + "/jobs/");
  await page.getByLabel("Role or keywords").fill("analyst");
  await page.getByLabel("Employer sponsorship", { exact: true }).selectOption("later");
  await page.getByRole("button", { name: "Find jobs", exact: true }).click();
  await expect(page.locator(".job-result-card").first()).toBeVisible({ timeout: 20000 });
  await page.locator(".job-result-card").first().getByRole("button", { name: /^Save / }).click();
  await page.getByRole("link", { name: "View board", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(1);
  await page.locator(".stage-select select").selectOption("Applied");
  await page.reload();
  await expect(page.getByRole("region", { name: "Applied jobs", exact: true }).locator(".application-card")).toHaveCount(1);
  await page.goto(base + "/dashboard/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("possibility");
  await page.getByRole("button", { name: "Open quick tour", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(base + "/prepare/");
  await page.getByRole("button", { name: "Try a fictional example", exact: true }).click();
  await expect(page.locator(".draft-text")).toContainText("fictional practice project");
  await page.getByRole("tab", { name: "Cover letter", exact: true }).click();
  await expect(page.locator(".draft-text")).toContainText("Dear hiring team at Northstar Labs");
  await page.getByRole("tab", { name: "Follow-up email", exact: true }).click();
  await expect(page.locator(".draft-text")).toContainText("Following up");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/workspace/", "/jobs/", "/dashboard/", "/applications/", "/prepare/", "/help/"]) {
    await page.goto(base + route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Mobile overflow: ${route}`).toBe(false);
  }
  expect(errors, "Browser errors").toEqual([]);
  expect(documentPosts, "Public preview must not submit personal documents").toEqual([]);
  console.log("Public showcase verified: home, CV edits, job feed, save job, persistent application stages, tour, preparation drafts and mobile.");
} finally {
  await browser.close();
}
