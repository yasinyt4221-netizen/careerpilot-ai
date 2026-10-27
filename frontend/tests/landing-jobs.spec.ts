import { expect, test } from "@playwright/test";

test("home follows the supplied layout and its actions work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("opportunity");
  await expect(page.getByLabel("Illustrative CV analysis preview")).toBeVisible();
  await page.getByRole("tab", { name: "Visual edits", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Visual edits" })).toContainText("BEFORE");
  await page.getByRole("tab", { name: "Job matches", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Job matches" })).toContainText("sponsorship");
  await page.getByRole("link", { name: "Get started free", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/?$/);
  await expect(page.getByLabel("Choose a PDF or DOCX CV")).toBeAttached();
});

test("home and job search fit mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/", "/jobs/"]) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

const result = {
  jobs: [{ id: "example:1", company: "Example Company", title: "Software Engineer", location: "London, UK", url: "https://example.com/jobs/1", provider: "greenhouse", description: "Python required", skill_score: null, matched_skills: [], missing_skills: [], sponsorship_status: "unknown", sponsorship_label: "Licensed employer · confirm this role", sponsorship_quote: null, sponsor_entities: [{ legal_name: "Example Company Ltd", route: "Skilled Worker", rating: "Worker (A rating)" }], sponsor_source: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers", sponsor_source_date: "2026-10-26", why: ["Named legal entity matched to the sponsor register"], next_action: "Show a real project example." }],
  total_matches: 1, listings_checked: 25, sources: [{ company: "Example Company", provider: "greenhouse", status: "checked", count: 25 }], searched_at: "2026-10-27T09:00:00Z", coverage: "Configured public sources only. Not all companies.", visa_note: "A licence does not establish eligibility.", more_platforms: [{ name: "LinkedIn", url: "https://www.linkedin.com/jobs/search/" }], visa_guidance_url: "https://www.gov.uk/skilled-worker-visa", register_available: true,
};

test("job search uses stated sponsorship needs and shows evidence without guaranteeing eligibility", async ({ page }) => {
  await page.route("**/api/jobs/search", route => route.fulfill({ json: result }));
  await page.goto("/jobs/");
  await page.getByLabel("Visa or work permission").fill("Graduate visa");
  await page.getByLabel("Employer sponsorship", { exact: true }).selectOption("later");
  const request = page.waitForRequest(request => request.url().endsWith("/api/jobs/search"));
  await page.getByRole("button", { name: "Find jobs", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ sponsorship_need: "later", visa_category: "Graduate visa", cv_text: "" });
  await expect(page.getByRole("heading", { name: "Software Engineer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Why this role?" }).click();
  await expect(page.getByText("Example Company Ltd", { exact: true })).toBeVisible();
  await page.getByText("Sources checked and visa guidance", { exact: true }).click();
  await expect(page.getByText("A licence does not establish eligibility.", { exact: true })).toBeVisible();
});

test("malformed external job links are rejected", async ({ page }) => {
  for (const malformed of [{ url: "javascript:alert(1)" }, { sponsor_entities: null }, { sponsor_source: "javascript:alert(1)" }]) {
    await page.route("**/api/jobs/search", route => route.fulfill({ json: { ...result, jobs: [{ ...result.jobs[0], ...malformed }] } }));
    await page.goto("/jobs/");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("unexpected response");
    await page.unroute("**/api/jobs/search");
  }
});
