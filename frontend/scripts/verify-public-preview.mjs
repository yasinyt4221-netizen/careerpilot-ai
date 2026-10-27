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
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/workspace/", "/jobs/"]) {
    await page.goto(base + route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Mobile overflow: ${route}`).toBe(false);
  }
  expect(errors, "Browser errors").toEqual([]);
  expect(documentPosts, "Public preview must not submit personal documents").toEqual([]);
  console.log("Public preview verified: home, sample review, highlights, visual changes, apply/undo, job feed and mobile.");
} finally {
  await browser.close();
}
