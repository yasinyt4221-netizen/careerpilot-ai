// Frontend-only checks. Provider/login responses are synthetic; no key is used.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const base = (process.env.RELEASE_URL || "http://127.0.0.1:3100/careerpilot-ai/").replace(/\/?$/, "/");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let sawBearer = false;
  await page.route("**/api/access/session", route => {
    assert.equal(route.request().postDataJSON().access_code, "synthetic-workspace-code");
    return route.fulfill({ json: { token: "synthetic-session-token", expires_in: 3600 } });
  });
  await page.route("**/api/ai/status", route => {
    sawBearer = route.request().headers().authorization === "Bearer synthetic-session-token";
    return route.fulfill({ json: { configured: true, verified: true, model: "gemini-3.5-flash-lite" } });
  });
  await page.goto(base + "workspace/");
  await page.getByLabel("Workspace access code", { exact: true }).fill("synthetic-workspace-code");
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.locator('option[value="gemini"]:not([disabled])').waitFor({ state: "attached" });
  assert(sawBearer, "Session token must reach only the configured backend");
  assert.equal(await page.getByLabel("Review engine").inputValue(), "gemini");
  assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("synthetic-"), "Neither code nor token belongs in browser storage");
  await page.getByRole("button", { name: "Lock workspace", exact: true }).click();
  await page.getByLabel("Workspace access code", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.goto(base);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await page.getByLabel("Workspace access code", { exact: true }).count(), 0, "Home remains public");
  assert.deepEqual(errors, []);
  console.log("Hosted frontend checks passed: private access, bearer header, Gemini selection, no secret persistence, lock, public home, mobile.");
} finally { await browser.close(); }
