"use client";

import { useSyncExternalStore } from "react";

export const STAGES = ["Saved", "Applied", "Interview", "Offer", "Closed"] as const;
export type Stage = typeof STAGES[number];
export type SavedJob = {
  id: string; company: string; title: string; location: string; url: string;
  stage: Stage; notes: string; nextDate: string; createdAt: string; updatedAt: string;
  sponsorship: string; sample: boolean;
};
const KEY = "careerpilot.applications.v1";
const EVENT = "careerpilot-applications";
const EMPTY: SavedJob[] = [];
let cachedRaw: string | null | undefined;
let cache: SavedJob[] = EMPTY;
let temporary = false;

export function safeJobUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function valid(value: unknown): value is SavedJob {
  if (!value || typeof value !== "object") return false;
  const job = value as SavedJob;
  return [job.id, job.company, job.title, job.location, job.url, job.notes, job.nextDate, job.createdAt, job.updatedAt, job.sponsorship].every(v => typeof v === "string") &&
    job.id.length < 1000 && job.company.length <= 200 && job.title.length <= 300 && job.notes.length <= 3000 &&
    STAGES.includes(job.stage) && typeof job.sample === "boolean" && (job.url === "" && job.sample || !!safeJobUrl(job.url)) &&
    (!job.nextDate || /^\d{4}-\d{2}-\d{2}$/.test(job.nextDate));
}
function read() {
  if (temporary) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed: unknown = raw && raw.length < 1_000_000 ? JSON.parse(raw) : [];
        cache = Array.isArray(parsed) ? parsed.filter(valid).slice(0, 100) : EMPTY;
      } catch { cache = EMPTY; }
    }
  } catch { /* Storage can be unavailable in private or restricted browsers. */ }
  return cache;
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(EVENT, listener); };
}
function write(jobs: SavedJob[]) {
  cache = jobs.slice(0, 100);
  cachedRaw = JSON.stringify(cache);
  try { window.localStorage.setItem(KEY, cachedRaw); temporary = false; }
  catch { temporary = true; }
  window.dispatchEvent(new Event(EVENT));
  return !temporary;
}
export function useApplications() { return useSyncExternalStore(subscribe, read, () => EMPTY); }
export function addApplication(job: Pick<SavedJob, "company" | "title" | "url" | "location" | "sponsorship">) {
  const current = read();
  if (!job.title.trim() || !job.company.trim() || job.title.length > 300 || job.company.length > 200) throw new Error("Enter a job title and company name within the field limits.");
  if (!safeJobUrl(job.url)) throw new Error("Use a valid HTTPS job link.");
  if (current.some(item => item.url === job.url)) return { persisted: !temporary, duplicate: true };
  if (current.length >= 100) throw new Error("Your board has 100 jobs. Remove a job before adding another.");
  const now = new Date().toISOString();
  const persisted = write([{ ...job, id: crypto.randomUUID(), stage: "Saved", notes: "", nextDate: "", createdAt: now, updatedAt: now, sample: false }, ...current]);
  return { persisted, duplicate: false };
}
export function updateApplication(id: string, patch: Partial<Pick<SavedJob, "stage" | "notes" | "nextDate">>) {
  return write(read().map(job => job.id === id ? { ...job, ...patch, updatedAt: new Date().toISOString() } : job));
}
export function removeApplication(id: string) { return write(read().filter(job => job.id !== id)); }
export function clearApplications() { return write([]); }
export function loadExampleBoard() {
  const now = new Date().toISOString();
  const date = new Date(); date.setDate(date.getDate() + 3);
  const examples: SavedJob[] = [
    { id: "sample-northstar", company: "Northstar Labs", title: "Data Analyst", location: "London · Hybrid", stage: "Interview", notes: "Example: prepare a dashboard project story using STAR.", nextDate: date.toLocaleDateString("en-CA"), sponsorship: "Fictional role · no visa assessment" },
    { id: "sample-fieldnote", company: "Fieldnote Studio", title: "Product Analyst", location: "Manchester · Hybrid", stage: "Applied", notes: "Example: check the role requirements before following up.", nextDate: "", sponsorship: "Fictional role · no visa assessment" },
    { id: "sample-orbit", company: "Orbit Works", title: "Junior Data Analyst", location: "Remote · UK", stage: "Saved", notes: "Example: tailor the CV before applying.", nextDate: "", sponsorship: "Fictional role · no visa assessment" },
  ].map(job => ({ ...job, url: "", sample: true, createdAt: now, updatedAt: now } as SavedJob));
  const current = read();
  return write([...current, ...examples.filter(example => !current.some(job => job.id === example.id))]);
}

export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportApplications(jobs: SavedJob[]) {
  // Guard spreadsheet formula prefixes in user-editable values.
  const cell = (value: string) => '"' + (/^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  const rows = [["Company", "Role", "Stage", "Location", "Job link", "Next date", "Notes", "Example"], ...jobs.map(job => [job.company, job.title, job.stage, job.location, job.url, job.nextDate, job.notes, job.sample ? "Yes" : "No"])];
  downloadText("careerpilot-applications.csv", "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}
