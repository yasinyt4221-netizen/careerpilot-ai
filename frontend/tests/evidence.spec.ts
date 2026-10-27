import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve("../backend/.test-fixtures/review.docx");
const JOB = "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.";

test("CV-only review finds skills and carries the CV into job recommendations", async ({ page }) => {
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await expect(page.getByRole("button", { name: "Analyse my CV", exact: true })).toBeEnabled();
  const reviewResponse = page.waitForResponse(response => response.url().endsWith("/api/cvs/review"));
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  const report = await (await reviewResponse).json();
  expect(report.score).toBeNull();
  await expect(page.getByRole("heading", { name: "What your CV demonstrates", exact: true })).toBeVisible();
  await expect(page.locator(".profile-skill-list")).toContainText("Python");
  await expect(page.getByRole("main")).not.toContainText(/\d+\s*\/\s*100/);
  await page.route("**/api/jobs/search", route => route.fulfill({ json: {
    jobs: [{ id: "fit-1", company: "Example Hiring Company", title: "Data Analyst", location: "London, UK", url: "https://example.com/jobs/1", provider: "greenhouse", description: JOB, skill_score: 33, matched_skills: ["Python", "SQL"], missing_skills: [], sponsorship_status: "unknown", sponsorship_label: "Confirm sponsorship", sponsorship_quote: null, sponsor_entities: [], sponsor_source: null, sponsor_source_date: null, why: ["Your CV names Python and SQL"], next_action: "Show an example", fit_label: "Some evidence", core_found: 2, core_total: 2, demonstrated_count: 0, hard_checks: [], skill_evidence: [{ skill: "SQL", priority: "required", status: "mentioned", cv_excerpt: "Python, SQL", line: 5, job_excerpt: "Python and SQL" }] }],
    total_matches: 1, listings_checked: 200, compared_count: 12, sources: [], searched_at: "2026-10-27T05:00:00Z", coverage: "Configured public feeds", visa_note: "Check eligibility", more_platforms: [], visa_guidance_url: null, register_available: false,
  } }));
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Find jobs", exact: true }).click();
  await expect(page.getByLabel("Role or keywords", { exact: true })).toHaveValue("");
  const request = page.waitForRequest(request => request.url().endsWith("/api/jobs/search"));
  await page.getByRole("button", { name: "Find roles for my CV", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ query: "", career_level: "student" });
  expect((await request).postDataJSON().cv_text).toContain("Python");
  await expect(page.locator(".job-fit-label")).toContainText("2 of 2 core skills supported");
  await expect(page.locator(".job-result-card")).not.toContainText("33");
  await page.getByRole("button", { name: "Why this role?" }).click();
  await expect(page.locator(".job-evidence-list")).toContainText("CV line 5");
  await page.getByRole("button", { name: "Show exact CV changes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("How your CV fits");
  await page.getByRole("button", { name: "See every requirement and the CV line behind it" }).click();
  await expect(page.locator(".requirement-table")).toContainText("Python");
});

test("exact deletion and duty rewrites identify their line and support undo", async ({ page }) => {
  const cv = "Profile\nHardworking motivated individual seeking a challenging role.\nProjects\nResponsible for creating dashboards using Tableau.";
  await page.route("**/api/cvs/extract", route => route.fulfill({ json: { extracted_text: cv, filename: "synthetic.docx" } }));
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.locator(".recommendation.selected")).toContainText("Line 2");
  await page.getByRole("button", { name: "Delete this line", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).not.toContainText("Hardworking");
  await page.getByRole("button", { name: "Undo last edit", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Hardworking");
  await page.getByTestId("cv-preview").getByRole("button", { name: /Replace this duty statement/ }).click();
  await expect(page.locator(".recommendation.selected")).toContainText("Created dashboards using Tableau.");
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Created dashboards using Tableau.");
  await expect(page.getByTestId("cv-preview")).not.toContainText("Responsible for");
});

test("work-example builder preserves the skill list and inserts only applicant facts", async ({ page }) => {
  await page.goto("/workspace/");
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await page.getByLabel("Job description", { exact: true }).fill(JOB);
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await page.getByTestId("cv-preview").getByRole("button", { name: /Show how you used Python, SQL/ }).click();
  await page.getByRole("button", { name: "Build a clear CV line from my facts", exact: true }).click();
  await page.getByLabel("What did you personally do?").fill("Queried customer tables");
  await page.getByLabel("Tool used in this specific work").fill("SQL");
  await page.getByLabel("Real purpose or outcome").fill("prepare monthly reporting");
  await expect(page.locator(".proposed-line")).toContainText("Queried customer tables using SQL to prepare monthly reporting.");
  await page.getByRole("button", { name: "Add example to Projects" }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Queried customer tables using SQL to prepare monthly reporting.");
  await expect(page.getByTestId("cv-preview")).toContainText("Python, SQL");
  await expect(page.getByTestId("cv-preview")).toContainText("Projects");
});

test("Gemini key form does not persist keys and document review requires an explicit choice", async ({ page }) => {
  const fakeKey = "synthetic-only-test-key";
  await page.route("**/api/ai/status", route => route.fulfill({ json: { configured: false, verified: false, model: "test-model" } }));
  await page.route("**/api/ai/connect", route => route.fulfill({ json: { configured: true, verified: true, model: "test-model" } }));
  await page.goto("/connections/");
  await page.getByLabel("Gemini API key", { exact: true }).fill(fakeKey);
  await page.getByRole("button", { name: "Connect and test key", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No CV was sent");
  await expect(page.getByLabel("Gemini API key", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(fakeKey);
  await page.unroute("**/api/ai/status");
  await page.route("**/api/ai/status", route => route.fulfill({ json: { configured: true, verified: true, model: "test-model" } }));
  await page.getByRole("link", { name: "Back to CV review" }).click();
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  let sent = false;
  await page.route("**/api/cvs/review", route => { sent = true; return route.fulfill({ json: { analysis: { title: null }, review: { changes: [], gaps: [], covered: [], notices: [] }, score: null, matches: [] } }); });
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose whether");
  expect(sent).toBe(false);
  await page.getByRole("checkbox", { name: /I choose to send this CV/ }).check();
  const request = page.waitForRequest(request => request.url().endsWith("/api/cvs/review"));
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ provider: "gemini", external_ai_consent: true });
  await page.getByRole("button", { name: "Change CV or job", exact: true }).click();
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture);
  await expect(page.getByRole("checkbox", { name: /I choose to send this CV/ })).not.toBeChecked();
});

test("student platform routes are honest external links and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/connections/");
  await expect(page.locator('a[href="https://aru.joinhandshake.com/"]')).toBeVisible();
  await expect(page.locator(".platform-card").first()).toContainText("no automatic sync");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.goto("/workspace/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("Gemini connection shows a safe diagnosis and can retry after a rejected key", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/ai/status", route => route.fulfill({ json: { configured: false, verified: false, model: "test-model" } }));
  await page.route("**/api/ai/connect", route => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({ api_key: "synthetic-only-test-key", model: "gemini-3.5-flash-lite" });
    return attempts === 1
      ? route.fulfill({ status: 400, json: { detail: "Google did not accept this key. Copy the full API key from Google AI Studio and try again.", code: "KEY_INVALID", provider_status: 400 } })
      : route.fulfill({ json: { configured: true, verified: true, model: "test-model" } });
  });
  await page.goto("/connections/");
  const input = page.getByLabel("Gemini API key", { exact: true });
  await input.fill("  synthetic-only-test-key  ");
  await page.getByRole("button", { name: "Connect and test key", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Google did not accept this key");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("KEY_INVALID · Google HTTP 400");
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
  await expect(page.getByRole("main")).not.toContainText("synthetic-only-test-key");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("synthetic-only-test-key");
  await input.fill("synthetic-only-test-key");
  await page.getByRole("button", { name: "Connect and test key", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("connection verified");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("Gemini connection explains when the local backend is unreachable", async ({ page }) => {
  await page.route("**/api/ai/status", route => route.fulfill({ json: { configured: false, verified: false, model: "test-model" } }));
  await page.route("**/api/ai/connect", route => route.abort("connectionfailed"));
  await page.goto("/connections/");
  await page.getByLabel("Gemini API key", { exact: true }).fill("synthetic-only-test-key");
  await page.getByRole("button", { name: "Connect and test key", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Cannot reach the local backend");
  await expect(page.getByLabel("Gemini API key", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Gemini API key", { exact: true })).toBeEnabled();
});
