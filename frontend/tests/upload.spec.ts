import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = (name: string) => path.resolve("../backend/.test-fixtures", name);
const JOB = "Data Analyst\nRequired:\nPython and SQL\nResponsibilities:\nBuild reporting dashboards for business stakeholders.\nPreferred:\nKubernetes";
const sample = "Synthetic CV\nPython SQL and data analysis\nBuilt a reporting dashboard";

test.beforeEach(async ({ page }) => { await page.goto("/workspace/"); await page.getByLabel("Job description", { exact: true }).fill(JOB); });

for (const extension of ["pdf", "docx"]) {
  test(`one-click ${extension.toUpperCase()} upload to annotated CV review`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await expect(page.getByRole("button", { name: "Analyse my CV", exact: true })).toBeDisabled();
    await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture(`synthetic.${extension}`));
    const extraction = page.waitForResponse(response => response.url().endsWith("/api/cvs/extract"));
    await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
    const response = await extraction;
    expect(response.status()).toBe(200);
    expect(response.headers()["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(await response.json()).toMatchObject({ word_count: 11, character_count: 69 });
    await expect(page.getByTestId("cv-preview")).toHaveText(sample);
    await expect(page.getByRole("region", { name: "CV review", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const [file, message] of [["unsupported.txt", "PDF or DOCX"], ["empty.pdf", "empty"], ["empty.docx", "empty"]]) {
  test(`rejects ${file} before uploading`, async ({ page }) => {
    let requests = 0;
    page.on("request", request => { if (request.url().endsWith("/api/cvs/extract")) requests++; });
    await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture(file));
    await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
    await expect(page.getByRole("button", { name: "Analyse my CV", exact: true })).toBeDisabled();
    expect(requests).toBe(0);
  });
}

for (const [file, message] of [
  ["damaged.pdf", "invalid or damaged"], ["damaged.docx", "invalid or damaged"],
  ["blank.docx", "No readable text"], ["scanned.pdf", "OCR"],
  ["encrypted.pdf", "Password-protected"], ["too-many-pages.pdf", "30 pages"],
]) {
  test(`shows validation for ${file} and recovers`, async ({ page }) => {
    await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture(file));
    await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
    await expect(page.getByTestId("cv-preview")).toHaveCount(0);
    await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture("synthetic.pdf"));
    await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
    await expect(page.getByTestId("cv-preview")).toHaveText(sample);
  });
}

test("rejects oversized files", async ({ page }) => {
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("5 MB");
});

test("useful connection error allows retry without losing inputs", async ({ page }) => {
  await page.route("**/api/cvs/extract", route => route.abort("connectionrefused"));
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture("synthetic.pdf"));
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Cannot reach the review service");
  await page.unroute("**/api/cvs/extract");
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByTestId("cv-preview")).toHaveText(sample);
});

test("non-JSON server errors and malformed extraction results are handled", async ({ page }) => {
  await page.getByLabel("Choose a PDF or DOCX CV").setInputFiles(fixture("synthetic.pdf"));
  await page.route("**/api/cvs/extract", route => route.fulfill({ status: 502, contentType: "text/html", body: "Bad gateway" }));
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be reviewed");
  await page.unroute("**/api/cvs/extract");
  await page.route("**/api/cvs/extract", route => route.fulfill({ json: { filename: "cv.pdf" } }));
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("unexpected response");
});

test("accepts one dropped CV and rejects multiple dropped files", async ({ page }) => {
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(["invalid content"], "dropped.pdf")); return data; });
  await page.locator(".drop-zone").dispatchEvent("drop", { dataTransfer: transfer });
  await page.getByRole("button", { name: "Analyse my CV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("not a valid PDF");
  const multiple = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(["one"], "one.pdf")); data.items.add(new File(["two"], "two.pdf")); return data; });
  await page.locator(".drop-zone").dispatchEvent("drop", { dataTransfer: multiple });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("one CV at a time");
});
