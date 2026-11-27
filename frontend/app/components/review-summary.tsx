"use client";

import { useState } from "react";
import type { ReviewItem, ReviewResponse } from "../review-types";
import { downloadText } from "../application-store";
import { evidenceState } from "./skill-requirements";
import { Icon } from "./icons";

// Mirrors HEADINGS in backend/cv_review.py, plus common extra sections.
const HEADING = /^(?:work experience|professional experience|experience|employment history|career history|projects|personal projects|selected projects|academic projects|skills|technical skills|key skills|core skills|skills summary|education|academic qualifications|education and qualifications|qualifications|certifications|certificates|licences|licenses|profile|summary|professional summary|personal profile|career summary|achievements|awards|languages|interests|hobbies|volunteering|volunteer experience|references|contact|contact details)$/i;

/** Applies every exact replacement/deletion the review proposed. Clarify-only items need the applicant's facts, so they stay untouched. */
export function applyChanges(text: string, changes: ReviewItem[]) {
  let result = text, cursor = Infinity;
  for (const item of changes.filter(change => change.replacement !== null).sort((a, b) => b.start! - a.start!)) {
    if (item.end! > cursor) continue; // overlapping suggestion: keep the first applied
    let end = item.end!;
    if (item.replacement === "" && result[end] === "\n") end += 1; // delete the whole line
    result = result.slice(0, item.start!) + item.replacement + result.slice(end);
    cursor = item.start!;
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function splitSections(text: string) {
  const sections: { title: string; body: string }[] = [{ title: "Name and contact", body: "" }];
  for (const line of text.split("\n")) {
    const heading = line.trim().replace(/^[#•*\-–—\s]+|[:\s]+$/g, "");
    if (HEADING.test(heading)) sections.push({ title: heading, body: "" });
    else sections[sections.length - 1].body += line + "\n";
  }
  return sections.map(section => ({ ...section, body: section.body.trim() })).filter(section => section.body);
}

const list = (items: string[], limit = 4) => items.slice(0, limit).join(", ") + (items.length > limit ? ` +${items.length - limit} more` : "");

export default function ReviewSummary({ text, response }: { text: string; response: ReviewResponse }) {
  const plan = response.review;
  const [sections, setSections] = useState(() => splitSections(applyChanges(text, plan.changes)));
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const [copyError, setCopyError] = useState("");
  const full = sections.map(section => section.title === "Name and contact" ? section.body : `${section.title.toUpperCase()}\n${section.body}`).join("\n\n");

  const checks = (response.matches ?? []).map(item => ({ label: item.requirement.label, required: item.requirement.priority === "required", state: evidenceState(item.status, item.evidence_status, item.evidence) }));
  const found = checks.filter(check => check.state === "found").map(check => check.label);
  const weak = checks.filter(check => check.state === "listed" || check.state === "related").map(check => check.label);
  const missing = checks.filter(check => check.state === "missing").map(check => check.label);
  const strengths = checks.length ? found : (response.profile?.skills ?? []).filter(skill => skill.status !== "mentioned").map(skill => skill.name);
  const applied = plan.changes.filter(item => item.replacement !== null).length;
  const needFacts = plan.changes.filter(item => item.replacement === null);

  const rows: [string, string][] = [
    ["The role", checks.length ? `${response.analysis.title ?? "This job"}: ${checks.length} requirements, ${checks.filter(check => check.required).length} required.` : "No job added. Paste an advert to check a specific role."],
    ...(checks.length ? [["Your fit", `${found.length} of ${checks.length} shown with evidence${weak.length ? `, ${weak.length} listed without an example` : ""}${missing.length ? `, ${missing.length} not in your CV` : ""}.`] as [string, string]] : []),
    ["Strengths", strengths.length ? list(strengths) : "No clear work examples found yet."],
    ...(missing.length ? [["Missing", `${list(missing)}. Add only if you have it.`] as [string, string]] : []),
    ["Fixed below", applied ? `${applied} ${applied === 1 ? "line" : "lines"} corrected.${needFacts.length ? ` ${needFacts.length} more need your own detail (see Line by line).` : ""}` : needFacts.length ? `${needFacts.length} lines need your own detail (see Line by line).` : "No wording fixes needed."],
  ];

  async function copy(value: string, which: number | "all") {
    try { await navigator.clipboard.writeText(value); setCopied(which); setCopyError(""); setTimeout(() => setCopied(current => current === which ? null : current), 1800); }
    catch { setCopyError("Clipboard is blocked. Select the text and copy it instead."); }
  }

  return <div className="review-summary">
    <section className="analysis-card" aria-labelledby="analysis-title">
      <h2 id="analysis-title">Analysis</h2>
      <dl>{rows.map(([term, detail]) => <div key={term} className={term === "Missing" ? "is-missing" : undefined}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
    </section>
    <section className="rewrite" aria-labelledby="rewrite-title">
      <div className="rewrite-heading"><div><h2 id="rewrite-title">Your improved CV</h2><p>Edit any section, then copy it into your CV.</p></div><div className="rewrite-actions"><button type="button" className="small-primary" onClick={() => copy(full, "all")}><Icon name={copied === "all" ? "check" : "file"} size={15}/>{copied === "all" ? "Copied" : "Copy full CV"}</button><button type="button" className="secondary-button" onClick={() => downloadText("hireready-cv.txt", full)}><Icon name="download" size={15}/>Download</button></div></div>
      {copyError && <p role="status" className="copy-help">{copyError}</p>}
      {sections.map((section, index) => <article className="rewrite-section" key={section.title + index}>
        <div className="rewrite-section-top"><label htmlFor={`section-${index}`}>{section.title}</label><button type="button" className="text-button" onClick={() => copy(section.body, index)} aria-label={`Copy ${section.title}`}>{copied === index ? "Copied" : "Copy"}</button></div>
        <textarea id={`section-${index}`} value={section.body} rows={Math.min(14, section.body.split("\n").length + 1)} maxLength={20000} spellCheck onChange={event => setSections(current => current.map((item, position) => position === index ? { ...item, body: event.target.value } : item))}/>
      </article>)}
    </section>
  </div>;
}
