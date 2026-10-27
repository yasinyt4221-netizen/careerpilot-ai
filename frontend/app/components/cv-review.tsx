"use client";

import { Fragment, useState } from "react";
import type { ReviewItem, ReviewResponse } from "../review-types";

type Props = {
  text: string;
  filename: string;
  response: ReviewResponse;
  updating: boolean;
  onReplace: (item: ReviewItem, replacement: string) => Promise<void>;
  onUndo: () => Promise<void>;
  canUndo: boolean;
  baselineScore: number | null;
};

export default function CVReview({ text, filename, response, baselineScore, updating, onReplace, onUndo, canUndo }: Props) {
  const plan = response.review;
  const [selected, setSelected] = useState(plan.changes[0]?.id ?? plan.gaps[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [wording, setWording] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const items = [...plan.changes, ...plan.gaps];
  const active = items.find(item => item.id === selected);
  const boundaries = [...new Set([0, text.length, ...plan.changes.flatMap(item => [item.start!, item.end!])])].sort((a, b) => a - b);

  function select(item: ReviewItem, scrollToText = false) {
    setSelected(item.id); setEditing(false); setWording("");
    if (scrollToText && item.start !== null) {
      document.getElementById(`cv-mark-${item.id}`)?.scrollIntoView({ block: "nearest" });
    }
    if (!scrollToText) requestAnimationFrame(() => document.getElementById(`recommendation-${item.id}`)?.scrollIntoView({ block: "nearest" }));
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(""); }
    catch { setCopyError("Select and copy the text in the preview instead."); }
  }

  function recommendation(item: ReviewItem, gap = false) {
    const open = selected === item.id;
    return <article key={item.id} className={`recommendation ${open ? "selected" : ""} ${gap ? "gap" : ""}`} data-testid={gap ? "gap-card" : "change-card"}>
      <button type="button" className="recommendation-toggle" aria-expanded={open} aria-controls={`recommendation-${item.id}`} onClick={() => { if (open) { setSelected(""); setEditing(false); } else select(item, true); }} disabled={updating}>
        <span className={`issue-dot ${item.category === "spelling" || item.category === "wording" ? "pink" : ""}`} aria-hidden="true" />
        <span><strong>{item.title}</strong><small>{gap ? "Check before adding" : item.category === "spelling" || item.category === "wording" ? "Wording" : "Make it clearer"}</small></span>
        <span className="chevron" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="recommendation-content" id={`recommendation-${item.id}`}>
        {item.replacement !== null ? <>
          <p>{item.explanation}</p>
          <div className="word-change"><del>{item.excerpt}</del><span aria-hidden="true">→</span><ins>{item.replacement}</ins></div>
          <button type="button" className="small-primary" disabled={updating} onClick={() => onReplace(item, item.replacement!)}>Apply change</button>
        </> : <>
        <p className="compact-location">Edit in <strong>{item.section}</strong></p>
        {item.excerpt && <div className="visual-comparison"><div><span>BEFORE</span><p>{item.excerpt}</p></div><div><span>BUILD YOUR AFTER VERSION</span><p>{item.structure ?? "State your action, the tools you used, and the real purpose."}</p><small>Fill the brackets with your facts.</small></div></div>}
        {!item.excerpt && <p>{item.explanation}</p>}
        <details className="plain-instructions" open={!item.excerpt}><summary>What to change</summary><ol>{item.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details>
        {item.job_requirement && <details className="job-source"><summary>What the job asks for</summary><p>{item.job_requirement}</p></details>}
        {item.excerpt && item.replacement === null && !editing && <div className="visual-edit-actions"><button type="button" className="edit-passage-button" disabled={updating} onClick={() => { setEditing(true); setWording(item.excerpt!); }}>Edit this passage</button>{item.structure && <button type="button" className="text-button" disabled={updating} onClick={() => { setEditing(true); setWording(item.structure!); }}>Use structure</button>}</div>}
        {editing && active?.id === item.id && <div className="passage-editor"><label htmlFor="revised-wording">Your revised wording</label><textarea id="revised-wording" value={wording} onChange={event => setWording(event.target.value)} maxLength={2000} disabled={updating} rows={5} /><p>Use your actual experience. Don’t leave bracketed prompts in your CV.</p><button type="button" className="small-primary" disabled={updating || !wording.trim() || wording === item.excerpt || /\[[^\]]+\]/.test(wording)} onClick={() => onReplace(item, wording.trim())}>Update preview</button></div>}
        </>}
      </div>}
    </article>;
  }

  return <section className="cv-review" aria-label="CV review">
    <div className="applicant-score"><svg viewBox="0 0 104 104" role="img" aria-label={`CV score ${response.score ?? "unavailable"} out of 100`}><circle className="score-track" cx="52" cy="52" r="43"/><circle className="score-fill" cx="52" cy="52" r="43" strokeDasharray={`${(response.score ?? 0) * 2.702} 271`}/><text x="52" y="59" textAnchor="middle">{response.score === null ? "—" : Math.round(response.score)}</text></svg><div><h1>Your CV score</h1><p>Alignment with this role, not an interview prediction.</p>{baselineScore !== null && response.score !== null && baselineScore !== response.score && <span className="score-improvement">Before {Math.round(baselineScore)} <span aria-hidden="true">→</span> Now {Math.round(response.score)}</span>}</div><div className="score-summary"><strong>{plan.changes.length}</strong><span>visual edits</span><strong>{plan.gaps.length}</strong><span>details to check</span></div></div>
    <div className="review-heading"><div><p className="eyebrow">YOUR NEXT EDITS</p><h2>Make these changes to your CV</h2><p>{plan.changes.length ? `${plan.changes.length} suggested ${plan.changes.length === 1 ? "change" : "changes"}. Select a highlight to see what to do.` : "No highlighted changes found in the checks we ran."}</p></div><span className="review-ready">Review ready</span></div>
    {plan.notices.map((notice, index) => <p className="review-notice" key={index}>{notice}</p>)}
    <div className="review-columns">
      <div className="cv-document-panel">
        <div className="document-toolbar"><div><strong>Your CV</strong><span>{filename}</span></div><div>{canUndo && <button type="button" className="text-button" disabled={updating} onClick={onUndo}>Undo last edit</button>}<button type="button" className="text-button" onClick={copy}>{copied ? "Copied" : "Copy text"}</button></div></div>
        {copyError && <p role="status" className="copy-help">{copyError}</p>}
        <div className="cv-paper" role="document" aria-label="Your CV with highlighted suggestions" data-testid="cv-preview">
          {boundaries.slice(0, -1).map((start, index) => {
            const end = boundaries[index + 1];
            const related = plan.changes.filter(item => item.start! <= start && item.end! >= end);
            if (!related.length) return <Fragment key={start}>{text.slice(start, end)}</Fragment>;
            const issue = related.find(item => item.id === selected) ?? related[0];
            return <button type="button" key={start} id={start === issue.start ? `cv-mark-${issue.id}` : undefined}
              className={`cv-highlight ${related.some(item => item.id === selected) ? "active" : ""} ${issue.category === "spelling" || issue.category === "wording" ? "pink" : ""}`}
              aria-label={`${issue.title}: ${text.slice(start, end)}`} aria-pressed={related.some(item => item.id === selected)} disabled={updating}
              onClick={() => select(issue)}>{text.slice(start, end)}</button>;
          })}
        </div>
        <p className="preview-note">This is a text preview. Copy your changes into your original CV before applying.</p>
      </div>
      <aside className="suggestions-panel" aria-label="CV recommendations" id="recommendations">
        <div className="suggestions-title"><h3>Suggested changes</h3><span>{plan.changes.length}</span></div>
        {plan.changes.length ? plan.changes.map(item => recommendation(item)) : <p className="quiet-message">No wording or clarity changes to show. Check any missing requirements below.</p>}
        {plan.gaps.length > 0 && <div className="gap-section"><h3>Missing details to check <span>{plan.gaps.length}</span></h3><p>Only add these if you have the experience or qualification.</p>{plan.gaps.map(item => recommendation(item, true))}</div>}
        {plan.covered.length > 0 && <details className="covered-details"><summary>Already clear in your CV ({plan.covered.length})</summary><ul>{plan.covered.map(label => <li key={label}>{label}</li>)}</ul></details>}
        <p className="review-footnote">Review every suggestion. Wording checks cover common typos and repeated words, not a complete grammar check.</p>
      </aside>
    </div>
  </section>;
}
