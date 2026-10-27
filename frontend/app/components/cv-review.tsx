"use client";

import { Fragment, useState } from "react";
import type { ReviewItem, ReviewResponse } from "../review-types";
import { downloadText } from "../application-store";
import EvidenceSummary from "./evidence-summary";

type Props = {
  text: string;
  filename: string;
  response: ReviewResponse;
  updating: boolean;
  onReplace: (item: ReviewItem, replacement: string) => Promise<void>;
  onUndo: () => Promise<void>;
  canUndo: boolean;
  baselineScore: number | null;
  onUpdateCV?: () => void;
};

export default function CVReview({ text, filename, response, updating, onReplace, onUndo, canUndo, onUpdateCV }: Props) {
  const plan = response.review;
  const [selected, setSelected] = useState(plan.changes[0]?.id ?? plan.gaps[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [wording, setWording] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [building, setBuilding] = useState(false);
  const [task, setTask] = useState("");
  const [tool, setTool] = useState("");
  const [outcome, setOutcome] = useState("");
  const proposedLine = `${task.trim().replace(/[.!]$/, "")}${tool.trim() ? ` using ${tool.trim()}` : ""}${outcome.trim() ? ` to ${outcome.trim().replace(/[.!]$/, "")}` : ""}.`;
  const items = [...plan.changes, ...plan.gaps];
  const active = items.find(item => item.id === selected);
  const boundaries = [...new Set([0, text.length, ...plan.changes.flatMap(item => [item.start!, item.end!])])].sort((a, b) => a - b);

  function select(item: ReviewItem, scrollToText = false) {
    setSelected(item.id); setEditing(false); setBuilding(false); setWording(""); setTask(""); setTool(""); setOutcome("");
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
        <span><strong>{item.title}</strong><small>{item.line_number ? `Line ${item.line_number} · ` : ""}{item.action === "delete" ? "Delete" : gap ? "Check before adding" : item.replacement !== null ? "Replace" : "Add specific evidence"}</small></span>
        <span className="chevron" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="recommendation-content" id={`recommendation-${item.id}`}>
        {item.replacement !== null ? <>
          <p>{item.explanation}</p>
          <div className="visual-comparison"><div><span>{item.line_number ? `LINE ${item.line_number} · CURRENT TEXT` : "CURRENT TEXT"}</span><p><del>{item.excerpt}</del></p></div><div><span>{item.replacement === "" ? "RECOMMENDED ACTION" : "REPLACE WITH"}</span><p>{item.replacement === "" ? "Delete this line. Keep the surrounding experience." : item.replacement}</p></div></div>
          <button type="button" className="small-primary" disabled={updating} onClick={() => onReplace(item, item.replacement!)}>{item.replacement === "" ? "Delete this line" : "Apply change"}</button>
        </> : <>
        <p className="compact-location">Edit in <strong>{item.section}</strong></p>
        {item.excerpt && <div className="visual-comparison"><div><span>{item.line_number ? `LINE ${item.line_number} · BEFORE` : "BEFORE"}</span><p>{item.excerpt}</p></div><div><span>{item.category === "skills" ? "KEEP THE SKILL LIST. ADD A WORK EXAMPLE." : "THE DETAIL THIS LINE NEEDS"}</span><p>{item.question ?? "What did you personally do, which tools did you actually use, and what did it help achieve?"}</p><small>Use your facts. The app will not invent missing experience.</small></div></div>}
        {!item.excerpt && <p>{item.explanation}</p>}
        <details className="plain-instructions" open={!item.excerpt}><summary>What to change</summary><ol>{item.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></details>
        {item.job_requirement && <details className="job-source"><summary>What the job asks for</summary><p>{item.job_requirement}</p></details>}
        {item.excerpt && item.replacement === null && !editing && <div className="visual-edit-actions"><button type="button" className="edit-passage-button" disabled={updating} onClick={() => { setEditing(true); setWording(item.excerpt!); }}>Edit this passage</button>{item.structure && <button type="button" className="text-button" disabled={updating} onClick={() => { setEditing(true); setWording(item.structure!); }}>Use structure</button>}</div>}
        {item.excerpt && item.replacement === null && !building && <button type="button" className="build-line-button" onClick={() => { setBuilding(true); setEditing(false); }}>Build a clear CV line from my facts</button>}
        {building && active?.id === item.id && <div className="line-builder"><label>What did you personally do?<input value={task} maxLength={700} onChange={e => setTask(e.target.value)} placeholder="Start with your actual action"/></label><label>Tool used in this specific work <span>(optional)</span><input value={tool} maxLength={150} onChange={e => setTool(e.target.value)} placeholder="Only name a tool you used here"/></label><label>Real purpose or outcome <span>(optional)</span><input value={outcome} maxLength={400} onChange={e => setOutcome(e.target.value)} placeholder="No invented metrics or results"/></label>{task.trim() && <div className="proposed-line"><strong>{item.category === "skills" ? "NEW PROJECTS LINE" : "YOUR PROPOSED REPLACEMENT"}</strong><p>{proposedLine}</p></div>}<button type="button" className="small-primary" disabled={updating || !task.trim() || /\[[^\]]+\]/.test(proposedLine)} onClick={() => {
          if (item.category !== "skills") { void onReplace(item, proposedLine); return; }
          const heading = /(?:^|\n)Projects[ \t]*\n/i.exec(text);
          const position = heading ? heading.index + heading[0].length : text.length;
          void onReplace({ ...item, start: position, end: position, excerpt: "" }, `${heading ? "" : "\n\nProjects\n"}${proposedLine}\n`);
        }}>{item.category === "skills" ? "Add example to Projects" : "Replace this line"}</button></div>}
        {editing && active?.id === item.id && <div className="passage-editor"><label htmlFor="revised-wording">Your revised wording</label><textarea id="revised-wording" value={wording} onChange={event => setWording(event.target.value)} maxLength={2000} disabled={updating} rows={5} /><p>Use your actual experience. Don’t leave bracketed prompts in your CV.</p><button type="button" className="small-primary" disabled={updating || !wording.trim() || wording === item.excerpt || /\[[^\]]+\]/.test(wording)} onClick={() => onReplace(item, wording.trim())}>Update preview</button></div>}
        </>}
      </div>}
    </article>;
  }

  return <section className="cv-review" aria-label="CV review">
    <EvidenceSummary response={response} onUpdateCV={onUpdateCV} onRequirement={id => {
      const requirement = response.matches?.find(match => match.requirement.id === id)?.requirement;
      const item = requirement && (items.find(candidate => candidate.title.toLowerCase().includes(requirement.label.toLowerCase())) ?? items.find(candidate => candidate.job_requirement === requirement.source));
      if (item) select(item, true);
      else document.querySelector(".suggestions-panel")?.scrollIntoView({ block: "start" });
    }}/>
    <div className="review-heading"><div><p className="eyebrow">YOUR NEXT EDITS</p><h2>Make these changes to your CV</h2><p>{plan.changes.length ? `${plan.changes.length} suggested ${plan.changes.length === 1 ? "change" : "changes"}. Select a highlight to see what to do.` : "No highlighted changes found in the checks we ran."}</p></div><span className="review-ready">Review ready</span></div>
    {plan.notices.map((notice, index) => <p className="review-notice" key={index}>{notice}</p>)}
    <div className="review-columns">
      <div className="cv-document-panel">
        <div className="document-toolbar"><div><strong>Your CV</strong><span>{filename}</span></div><div>{canUndo && <button type="button" className="text-button" disabled={updating} onClick={onUndo}>Undo last edit</button>}<button type="button" className="text-button" onClick={copy}>{copied ? "Copied" : "Copy text"}</button><button type="button" className="text-button" onClick={() => downloadText("careerpilot-reviewed-cv.txt", text)}>Download text</button><button type="button" className="text-button" onClick={() => window.print()}>Print review</button></div></div>
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
