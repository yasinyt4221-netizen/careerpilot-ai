"use client";

import { useEffect, useRef, useState } from "react";
import CVReview from "../components/cv-review";
import { isReviewResponse, readResponse, type ReviewItem, type ReviewResponse } from "../review-types";
import SiteHeader from "../components/site-header";
import JobFinder from "../components/job-finder";
import { API_URL, DEMO_MODE, publicAsset } from "../api-config";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [cvText, setCvText] = useState<string | null>(null);
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState<"reading" | "analysing" | "updating" | null>(null);
  const [error, setError] = useState("");
  const [editingInputs, setEditingInputs] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [baselineScore, setBaselineScore] = useState<number | null>(null);
  const [showJobs, setShowJobs] = useState(false);
  const [demoHistory, setDemoHistory] = useState<{ text: string; response: ReviewResponse }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(() => () => { revision.current++; controller.current?.abort(); }, []);

  function invalidate() {
    revision.current++; controller.current?.abort();
    setBusy(null); setResponse(null); setError(""); setEditingInputs(true);
  }

  function choose(candidate: File | undefined) {
    if (DEMO_MODE) return;
    invalidate(); setFile(null); setCvText(null); setHistory([]);
    if (!candidate) return;
    if (!/\.(pdf|docx)$/i.test(candidate.name)) setError("Choose a PDF or DOCX CV.");
    else if (candidate.size === 0) setError("This file is empty. Choose a CV with text in it.");
    else if (candidate.size > MAX_FILE_SIZE) setError("Choose a file of 5 MB or smaller.");
    else setFile(candidate);
  }

  async function requestReview(text: string, signal: AbortSignal): Promise<ReviewResponse> {
    const result = await fetch(`${API_URL}/api/matches/compare`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
      body: JSON.stringify({ cv_text: text, job_description: description }),
    });
    const data = await readResponse(result);
    if (!isReviewResponse(data, text)) throw new Error("The review service returned an unexpected response. Please try again.");
    return data;
  }

  async function runReview(editedText?: string, undo = false) {
    if (DEMO_MODE) return;
    if (busy || !file || description.trim().length < 30) return;
    const current = ++revision.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 120_000);
    setError(""); setBusy(editedText === undefined ? cvText ? "analysing" : "reading" : "updating");
    try {
      let text = editedText ?? cvText;
      if (text === null) {
        const form = new FormData(); form.append("file", file);
        const result = await fetch(`${API_URL}/api/cvs/extract`, { method: "POST", body: form, signal: abort.signal, cache: "no-store" });
        const data = await readResponse(result);
        if (data === null || typeof data !== "object" || !("extracted_text" in data) || typeof data.extracted_text !== "string" || !data.extracted_text.trim()) {
          throw new Error("The review service returned an unexpected response. Please try again.");
        }
        text = data.extracted_text.trim();
      }
      text = text.trim();
      if (current !== revision.current) return;
      setBusy(editedText === undefined ? "analysing" : "updating");
      const data = await requestReview(text, abort.signal);
      if (current !== revision.current) return;
      if (editedText !== undefined && cvText !== null) setHistory(previous => undo ? previous.slice(0, -1) : [...previous, cvText].slice(-10));
      if (editedText === undefined) setBaselineScore(data.score);
      setCvText(text); setResponse(data); setEditingInputs(false); setReviewVersion(value => value + 1);
      if (editedText === undefined) requestAnimationFrame(() => reviewHeading.current?.focus());
    } catch (err) {
      if (current === revision.current) {
        setError(abort.signal.aborted ? "The review took too long. Try a shorter CV or job description." :
          err instanceof TypeError ? "Cannot reach the review service. Check that the backend is running and try again." :
          err instanceof Error ? err.message : "Your CV could not be reviewed. Please try again.");
      }
    } finally {
      clearTimeout(timeout);
      if (current === revision.current) setBusy(null);
    }
  }

  async function replace(item: ReviewItem, replacement: string) {
    if (cvText === null || item.start === null || item.end === null || cvText.slice(item.start, item.end) !== item.excerpt) {
      setError("This passage has changed. Analyse your CV again before editing it."); return;
    }
    if (DEMO_MODE && response) {
      const nextText = cvText.slice(0, item.start) + replacement + cvText.slice(item.end);
      const difference = replacement.length - (item.end - item.start);
      const changes = response.review.changes.filter(change => change.id !== item.id && !(change.start! < item.end! && change.end! > item.start!)).map(change => change.start! >= item.end! ? { ...change, start: change.start! + difference, end: change.end! + difference } : change);
      setDemoHistory(previous => [...previous, { text: cvText, response }].slice(-10)); setCvText(nextText);
      setResponse({ ...response, review: { ...response.review, changes } }); setReviewVersion(value => value + 1);
      return;
    }
    await runReview(cvText.slice(0, item.start) + replacement + cvText.slice(item.end));
  }

  async function loadDemo() {
    setBusy("analysing"); setError("");
    try {
      const data = await readResponse(await fetch(publicAsset("sample-review.json"))) as { cv_text: string; job_description: string; report: unknown };
      if (!isReviewResponse(data.report, data.cv_text)) throw new Error("The sample review is unavailable. Please try again later.");
      setCvText(data.cv_text); setDescription(data.job_description); setResponse(data.report); setBaselineScore(data.report.score); setEditingInputs(false); setHistory([]); setDemoHistory([]); setReviewVersion(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Sample review unavailable."); }
    finally { setBusy(null); }
  }

  function cancel() { revision.current++; controller.current?.abort(); setBusy(null); }

  async function undoEdit() {
    if (!DEMO_MODE) { await runReview(history[history.length - 1], true); return; }
    const previous = demoHistory[demoHistory.length - 1];
    if (previous) { setCvText(previous.text); setResponse(previous.response); setDemoHistory(value => value.slice(0, -1)); setReviewVersion(value => value + 1); }
  }

  return <div>
    <SiteHeader />
    <main className="workspace">
      {DEMO_MODE && <div className="demo-banner"><p><strong>Public preview.</strong> Explore a sample CV and published job feeds. Personal CV uploads are disabled until secure backend hosting is connected.</p><button type="button" className="small-primary" onClick={loadDemo} disabled={!!busy}>Try the sample CV</button>{response && <span> Edits stay in this preview; the sample score is not recalculated.</span>}</div>}
      {!response && <div className="intro"><p className="eyebrow">A CLEARER CV. A STRONGER APPLICATION.</p><h1>Know exactly what to change.</h1><p>Upload your CV and paste the job description.<br />Get highlighted passages and practical recommendations.</p></div>}

      {response && <div className="input-summary"><div><span aria-hidden="true">✓</span><p><strong>{file?.name}</strong><small>{response.analysis.title ?? "Your chosen role"}</small></p></div><button className="text-button" type="button" onClick={() => setEditingInputs(value => !value)} disabled={!!busy}>{editingInputs ? "Close inputs" : "Change CV or job"}</button></div>}

      <form className="review-form" onSubmit={event => { event.preventDefault(); void runReview(); }} hidden={!editingInputs} aria-busy={!!busy}>
        <div className="input-grid">
          <section className="input-panel" aria-labelledby="cv-heading"><div className="section-heading"><span>1</span><h2 id="cv-heading">Your CV</h2></div>
            <label className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => {
              event.preventDefault(); setDragging(false); if (busy || DEMO_MODE) return;
              if (event.dataTransfer.files.length !== 1) { invalidate(); setFile(null); setCvText(null); setError("Choose one CV at a time."); return; }
              choose(event.dataTransfer.files[0]);
            }}>
              <input ref={input} type="file" accept=".pdf,.docx" aria-label="Choose a PDF or DOCX CV" aria-describedby="upload-help" disabled={!!busy || DEMO_MODE} onChange={event => { choose(event.target.files?.[0]); event.target.value = ""; }} />
              <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <strong>{file ? file.name : "Drop your CV here"}</strong><span>{file ? "Click to choose a different file" : <>or <u>browse files</u></>}</span><small>PDF or DOCX · Up to 5 MB</small>
            </label><p className="input-help" id="upload-help">Use a text-based CV. Scanned PDFs need OCR first.</p>
          </section>
          <section className="input-panel" aria-labelledby="job-heading"><div className="section-heading"><span>2</span><h2 id="job-heading">The job you want</h2></div><label className="sr-only" htmlFor="job-description">Job description</label><textarea id="job-description" rows={8} value={description} maxLength={20_000} disabled={!!busy || DEMO_MODE} placeholder="Paste the job description here, including responsibilities and requirements…" onChange={event => { invalidate(); setDescription(event.target.value); }} /><p className="input-help">Include the skills and experience the employer asks for.</p></section>
        </div>
        <div className="form-footer"><p>{DEMO_MODE ? "Use “Try the sample CV” above to explore this public preview." : !file ? "Add your CV and job description to get started." : description.trim().length < 30 ? "Paste at least 30 characters from the job description." : "Ready to review your CV for this role."}</p><button type="submit" className="primary-button" disabled={DEMO_MODE || !file || description.trim().length < 30 || !!busy}>{busy === "reading" ? "Reading your CV…" : busy === "analysing" ? "Analysing your CV…" : "Analyse my CV"}{!busy && <span aria-hidden="true">↗</span>}</button></div>
      </form>

      {busy && <div role="status" className="loading-note"><span className="spinner" aria-hidden="true" />{busy === "updating" ? "Updating your review…" : busy === "reading" ? "Reading your CV…" : "Finding useful changes for this role…"}<button type="button" className="text-button" onClick={cancel}>Cancel</button></div>}
      {error && <div role="alert" className="error-message">{error}</div>}
      {response && cvText !== null && <><div ref={reviewHeading} tabIndex={-1} className="review-result"><CVReview key={reviewVersion} text={cvText} filename={file?.name ?? "Sample CV"} response={response} baselineScore={baselineScore} updating={!!busy} onReplace={replace} onUndo={undoEdit} canUndo={DEMO_MODE ? demoHistory.length > 0 : history.length > 0} /></div><div className="workspace-job-toggle"><div><h2>Find your next opportunity</h2><p>Explore public job boards with your skills and sponsorship needs in mind.</p></div><button className="primary-button" type="button" onClick={() => setShowJobs(value => !value)}>{showJobs ? "Hide jobs" : "Find matching jobs"}</button></div>{showJobs && <JobFinder cvText={DEMO_MODE ? "" : cvText} onSelect={DEMO_MODE ? undefined : selected => { invalidate(); setDescription(selected); setShowJobs(false); }}/>}</>}
      <footer className="workspace-footer"><p>Your experience, in your own words. Only add what is true.</p><p>Development demo · Use synthetic CVs only</p></footer>
    </main>
  </div>;
}
