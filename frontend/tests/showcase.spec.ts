import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const STORAGE_KEY = "careerpilot.applications.v1";
async function loadBoard(page: Page) {
  await page.goto("/applications/");
  await page.getByRole("button", { name: "Load example board", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(3);
}

test("showcase dashboard loads labelled examples and stages persist across reload", async ({ page }) => {
  await page.goto("/dashboard/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("possibility");
  await page.getByRole("button", { name: "Load example board", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("fictional");
  await page.getByRole("link", { name: "View application board", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(3);
  await page.getByLabel("Stage for Junior Data Analyst at Orbit Works").selectOption("Applied");
  await page.reload();
  await expect(page.getByRole("region", { name: "Applied jobs", exact: true }).locator(".application-card")).toHaveCount(2);
  await page.goto("/dashboard/");
  await expect(page.getByRole("region", { name: "Application statistics" }).getByRole("link", { name: /Applications sent/ })).toContainText("3");
});

test("a job can be added, edited, exported safely and removed", async ({ page }, testInfo) => {
  await page.goto("/applications/");
  await page.getByRole("button", { name: "Add a job", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Job title").fill("Data Analyst");
  await modal.getByLabel("Company", { exact: true }).fill("Example Hiring Team");
  await modal.getByLabel("Location", { exact: true }).fill("London");
  await modal.getByLabel("Job advert link").fill("http://example.com/jobs/1");
  await modal.getByRole("button", { name: "Add to board" }).click();
  await expect(modal.getByRole("alert")).toContainText("HTTPS");
  await modal.getByLabel("Job advert link").fill("https://example.com/jobs/1");
  await modal.getByRole("button", { name: "Add to board" }).click();
  await page.getByRole("button", { name: "Data Analyst", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Details for Data Analyst" });
  await details.getByLabel("Next-action date").fill("2026-11-05");
  await details.getByLabel("Notes", { exact: true }).fill(' =HYPERLINK("https://example.com","test")');
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByRole("status")).toContainText("saved");
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const filename = testInfo.outputPath("board.csv");
  await download.saveAs(filename);
  const content = await readFile(filename, "utf8");
  expect(content).toContain("Example Hiring Team");
  expect(content).toContain("2026-11-05");
  expect(content).toContain("' =HYPERLINK");
  await page.reload();
  await page.getByRole("button", { name: "Data Analyst", exact: true }).click();
  await expect(details.getByLabel("Next-action date")).toHaveValue("2026-11-05");
  await details.getByRole("button", { name: "Remove job", exact: true }).click();
  await details.getByRole("button", { name: "Keep job", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(1);
  await details.getByRole("button", { name: "Remove job", exact: true }).click();
  await details.getByRole("button", { name: "Yes, remove job", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(0);
});

test("a public job can be saved once and opened on the application board", async ({ page }) => {
  const job = { id: "public:1", company: "Example Company", title: "Software Engineer", location: "London, UK", url: "https://example.com/jobs/1", provider: "greenhouse", description: "Python required", skill_score: null, matched_skills: [], missing_skills: [], sponsorship_status: "unknown", sponsorship_label: "Confirm sponsorship with employer", sponsorship_quote: null, sponsor_entities: [], sponsor_source: null, sponsor_source_date: null, why: ["Matches role keywords"], next_action: "Review the advert." };
  await page.route("**/api/jobs/search", route => route.fulfill({ json: { jobs: [job], total_matches: 1, listings_checked: 1, sources: [], searched_at: "2026-10-27T03:00:00Z", coverage: "One test source", visa_note: "Check eligibility", more_platforms: [], visa_guidance_url: null, register_available: false } }));
  await page.goto("/jobs/");
  await page.getByRole("button", { name: "Find jobs", exact: true }).click();
  await page.getByRole("button", { name: "Save Software Engineer at Example Company", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Software Engineer at Example Company", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "View board", exact: true }).click();
  await expect(page.locator(".application-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Software Engineer", exact: true })).toBeVisible();
});

test("sample review is usable from a direct link and downloads the edited text without posting it", async ({ page }) => {
  const documentRequests: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/api\/(cvs|matches)/.test(request.url())) documentRequests.push(request.url()); });
  await page.goto("/workspace/?sample=1");
  await expect(page.getByRole("region", { name: "CV review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experience in reporting");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("careerpilot-reviewed-cv.txt");
  await page.getByRole("button", { name: "Undo last edit", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toContainText("Experiance");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-topbar")).not.toBeVisible();
  await expect(page.getByTestId("cv-preview")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(documentRequests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain("cv_text");
});

test("interview drafts belong to their question and templates use supplied facts", async ({ page }) => {
  await page.goto("/prepare/");
  await page.getByLabel("Situation answer").fill("Our test dashboard had inconsistent reporting definitions.");
  await expect(page.locator(".draft-text")).toContainText("inconsistent reporting");
  await page.getByRole("button", { name: "Practice question 2", exact: true }).click();
  await expect(page.getByLabel("Situation answer")).toHaveValue("");
  await page.getByRole("button", { name: "Practice question 1", exact: true }).click();
  await expect(page.getByLabel("Situation answer")).toHaveValue(/inconsistent reporting/);
  await page.getByRole("tab", { name: "Interview practice", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Cover letter", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Copy draft" })).toBeDisabled();
  await page.getByLabel("Company", { exact: true }).fill("Example Company");
  await page.getByLabel("Your name", { exact: true }).fill("Synthetic Applicant");
  await page.getByLabel("Why this role interests you").fill("I enjoy building clear data products.");
  await page.getByLabel("A relevant example from your experience").fill("I built a dashboard for a synthetic practice project.");
  await expect(page.locator(".draft-text")).toContainText("I built a dashboard for a synthetic practice project.");
  await expect(page.locator(".draft-text")).not.toContainText("Northstar");
  await page.getByRole("tab", { name: "Follow-up email", exact: true }).click();
  await page.getByLabel("Date you applied").fill("2026-10-25");
  await expect(page.locator(".draft-text")).toContainText("25 October 2026");
});

test("fictional practice exports are clearly marked", async ({ page }, testInfo) => {
  await page.goto("/prepare/");
  await page.getByRole("button", { name: "Try a fictional example" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text", exact: true }).click();
  const filename = testInfo.outputPath("interview.txt");
  await (await downloadPromise).saveAs(filename);
  expect(await readFile(filename, "utf8")).toMatch(/^FICTIONAL PRACTICE EXAMPLE/);
});

test("corrupt saved data is ignored and blocked storage keeps the demo usable", async ({ page }) => {
  await page.addInitScript(key => { localStorage.setItem(key, "not-json"); const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, value) { if (k === key) throw new DOMException("Blocked", "SecurityError"); return original.call(this, k, value); }; }, STORAGE_KEY);
  await page.goto("/applications/");
  await page.getByRole("button", { name: "Load example board", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("tab only");
  await expect(page.locator(".application-card")).toHaveCount(3);
});

test("browser data can be cleared with an explicit cancel option", async ({ page }) => {
  await loadBoard(page);
  await page.goto("/help/");
  await page.getByRole("button", { name: "Clear browser data", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, STORAGE_KEY)).toBe(3);
  await page.getByRole("button", { name: "Clear browser data", exact: true }).click();
  await page.getByRole("button", { name: "Delete all saved roles", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("cleared");
  await page.goto("/applications/");
  await expect(page.locator(".application-card")).toHaveCount(0);
});

test("tour opens with keyboard focus and every showcase page fits a phone", async ({ page }) => {
  await page.goto("/dashboard/");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Share demo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("saved roles are not included");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/dashboard\/$/);
  await page.getByRole("button", { name: "Dismiss share message", exact: true }).click();
  await page.getByRole("button", { name: "Open quick tour", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("See the change");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await loadBoard(page);
  for (const route of ["/dashboard/", "/applications/", "/prepare/", "/help/", "/workspace/?sample=1"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), route).toBe(false);
    await expect(page.getByRole("navigation", { name: "Mobile workspace navigation" })).toBeVisible();
  }
});
