"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiFetch, API_URL, DEMO_MODE, publicAsset } from "../api-config";
import { readResponse } from "../review-types";
import { Icon } from "./icons";
import Link from "next/link";
import { addApplication, useApplications } from "../application-store";
import SkillRequirements, { evidenceState } from "./skill-requirements";

type Job = {
  id: string; company: string; title: string; location: string; url: string; provider: string; description: string;
  skill_score: number | null; matched_skills: string[]; missing_skills: string[]; sponsorship_status: string;
  sponsorship_label: string; sponsorship_quote: string | null; why: string[]; next_action: string;
  sponsor_entities: { legal_name: string; route: string; rating: string }[]; sponsor_source: string | null; sponsor_source_date: string | null;
  country_hint?: string | null;
  fit_label?: string; core_found?: number; core_total?: number; demonstrated_count?: number; hard_checks?: string[];
  skill_evidence?: { skill: string; priority: string; status: string; cv_excerpt: string | null; job_excerpt: string; line: number | null }[];
};
type Results = { jobs: Job[]; total_matches: number; listings_checked: number; compared_count?: number; senior_roles_excluded?: number; sources: { company: string; provider: string; status: string; count: number }[]; searched_at: string; coverage: string; visa_note: string; more_platforms: { name: string; url: string }[]; visa_guidance_url: string | null; register_available: boolean };
const safeUrl = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
const subscribeHydrated = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
function isResults(value: unknown): value is Results {
  if (value === null || typeof value !== "object") return false;
  const data = value as Results;
  const strings = (items: unknown) => Array.isArray(items) && items.every(item => typeof item === "string");
  return Array.isArray(data.jobs) && data.jobs.every(job => job && typeof job === "object" &&
    [job.id, job.title, job.company, job.location, job.provider, job.description, job.sponsorship_label, job.sponsorship_status, job.next_action].every(item => typeof item === "string") &&
    typeof job.url === "string" && safeUrl(job.url) && strings(job.matched_skills) && strings(job.missing_skills) && strings(job.why) &&
    (job.skill_score === null || typeof job.skill_score === "number" && Number.isFinite(job.skill_score) && job.skill_score >= 0 && job.skill_score <= 100) &&
    (job.sponsorship_quote === null || typeof job.sponsorship_quote === "string") &&
    (job.sponsor_source === null || typeof job.sponsor_source === "string" && safeUrl(job.sponsor_source)) &&
    (job.sponsor_source_date === null || typeof job.sponsor_source_date === "string") &&
    Array.isArray(job.sponsor_entities) && job.sponsor_entities.every(entity => entity && [entity.legal_name, entity.route, entity.rating].every(item => typeof item === "string"))) &&
    Array.isArray(data.sources) && data.sources.every(source => source && [source.company, source.provider, source.status].every(item => typeof item === "string") && Number.isInteger(source.count) && source.count >= 0) &&
    Number.isInteger(data.total_matches) && data.total_matches >= 0 && Number.isInteger(data.listings_checked) && data.listings_checked >= 0 &&
    typeof data.coverage === "string" && typeof data.visa_note === "string" && typeof data.searched_at === "string" && Number.isFinite(Date.parse(data.searched_at)) &&
    (data.visa_guidance_url === null || typeof data.visa_guidance_url === "string" && safeUrl(data.visa_guidance_url)) &&
    Array.isArray(data.more_platforms) && data.more_platforms.every(link => link && typeof link.name === "string" && typeof link.url === "string" && safeUrl(link.url));
}

export default function JobFinder({ cvText = "", onSelect }: { cvText?: string; onSelect?: (description: string) => void }) {
  const hydrated = useSyncExternalStore(subscribeHydrated, clientReady, serverReady);
  const [query, setQuery] = useState(cvText ? "" : "Software engineer");
  const [careerLevel, setCareerLevel] = useState(cvText ? "student" : "any");
  const [country, setCountry] = useState("United Kingdom");
  const [visa, setVisa] = useState("");
  const [need, setNeed] = useState("unknown");
  const [hideNo, setHideNo] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const savedJobs = useApplications();
  const [saveMessage, setSaveMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { const previous = request.current; request.current = null; previous?.abort(); }, []);

  function invalidate() { const previous = request.current; request.current = null; previous?.abort(); setBusy(false); setResults(null); setError(""); }
  function saveJob(job: Job) {
    try {
      const result = addApplication({ title: job.title, company: job.company, url: job.url, location: job.location, sponsorship: job.sponsorship_label });
      setSaveMessage(result.duplicate ? "This role is already on your board." : result.persisted ? "Role saved to your application board in this browser." : "Role saved for this tab only; browser storage is unavailable.");
    } catch (err) { setSaveMessage(err instanceof Error ? err.message : "Could not save this role."); }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault(); if (busy || (!cvText && query.trim().length < 2)) return;
    const abort = new AbortController(); request.current = abort;
    const timeout = setTimeout(() => abort.abort(), 90_000);
    setBusy(true); setError(""); setResults(null); setOpenJob(null);
    try {
      let data: unknown;
      if (DEMO_MODE && !API_URL) {
        const response = await fetch(publicAsset("jobs-feed.json"), { signal: abort.signal, cache: "no-store" });
        const snapshot = await readResponse(response) as { results: Record<string, Results> };
        const available = snapshot.results[country] ?? snapshot.results["Any"];
        if (!available) throw new Error("No published job feed is available yet. Open the original platforms below.");
        const tokens = query.toLowerCase().trim().split(/\s+/);
        const coreRoles = tokens.filter(token => ["engineer", "developer", "analyst", "scientist", "designer", "manager", "nurse", "teacher", "accountant", "recruiter"].includes(token));
        let jobs = available.jobs.filter(job => (country === "United Kingdom" && job.country_hint === country || matchesCountry(job.location, country)) && tokens.every(token => (job.title + " " + job.description).toLowerCase().includes(token)) && coreRoles.every(role => job.title.toLowerCase().split(/\W+/).includes(role)) && (!hideNo || job.sponsorship_status !== "not_offered"));
        if (need === "now" || need === "later") jobs = jobs.sort((a, b) => {
          const rank = (job: Job) => job.sponsorship_status === "offered" ? 3 : job.sponsor_entities.length ? 2 : job.sponsorship_status === "not_offered" ? 0 : 1;
          return rank(b) - rank(a);
        });
        data = { ...available, jobs: jobs.slice(0, 25), total_matches: jobs.length, more_platforms: platformLinks(query, country) };
      } else {
        const response = await apiFetch(`${API_URL}/api/jobs/search`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ query: query.trim(), country, visa_category: visa, sponsorship_need: need, hide_no_sponsorship: hideNo, cv_text: cvText, career_level: careerLevel, limit: 25 }) });
        data = await readResponse(response);
      }
      if (request.current !== abort) return;
      if (!isResults(data)) throw new Error("The job service returned an unexpected response.");
      setResults(data);
    } catch (err) {
      if (request.current === abort && !abort.signal.aborted) setError(err instanceof TypeError ? "Cannot reach the jobs service. Please try again." : err instanceof Error ? err.message : "Job search failed.");
      else if (request.current === abort) setError("The search took too long. Please try again.");
    } finally { clearTimeout(timeout); if (request.current === abort) setBusy(false); }
  }

  return <section className="job-discovery" aria-labelledby="jobs-heading"><div className="job-discovery-heading"><div><p className="eyebrow">YOUR NEXT OPPORTUNITY</p><h1 id="jobs-heading">Find roles your CV can support.</h1><p>Compare real requirements with your work and projects. See the evidence behind each recommendation.</p></div><span className="job-source-badge"><Icon name="briefcase" size={16}/>{DEMO_MODE && !API_URL ? "Published job feed" : "Public company feeds"}</span></div>
    <div className="cv-search-context">{cvText ? <><Icon name="file" size={20}/><p><strong>Matching from your CV</strong><span>No title needed. We compare the connected listings against the skills and work your CV demonstrates.</span></p><label>Career stage<select aria-label="Career stage" value={careerLevel} onChange={e => { invalidate(); setCareerLevel(e.target.value); }}><option value="student">Student / graduate</option><option value="any">Any seniority</option></select></label></> : <p><Link href="/workspace/">Upload your CV</Link> to rank companies against your experience rather than a keyword search.</p>}<Link href="/connections/">LinkedIn, Indeed & Handshake <Icon name="external" size={13}/></Link></div>
    <form className="job-search-form" onSubmit={search} aria-busy={busy}><div className="job-search-main"><label>Role or keywords<input value={query} onChange={event => { invalidate(); setQuery(event.target.value); }} maxLength={100} placeholder={cvText ? "Optional: narrow by a role" : "e.g. Data analyst"} required={!cvText} minLength={2}/></label><label>Job country<select aria-label="Job country" value={country} onChange={event => { invalidate(); setCountry(event.target.value); }}>{["United Kingdom", "Ireland", "Germany", "Netherlands", "United States", "Canada", "Australia", "Any"].map(value => <option key={value}>{value}</option>)}</select></label><button className="primary-button" type="submit" disabled={!hydrated || busy || (!cvText && query.trim().length < 2)}>{busy ? "Comparing CV evidence…" : cvText ? "Find roles for my CV" : "Find jobs"}<Icon name="arrow" size={17}/></button></div>
      <details className="visa-profile" open><summary><Icon name="shield" size={16}/>Your work permission</summary><div><label>Visa or work permission <span>(optional)</span><input value={visa} maxLength={100} placeholder="e.g. Graduate visa" onChange={event => { invalidate(); setVisa(event.target.value); }}/></label><label>Employer sponsorship<select aria-label="Employer sponsorship" value={need} onChange={event => { invalidate(); setNeed(event.target.value); }}><option value="unknown">I need to check</option><option value="now">I need sponsorship now</option><option value="later">I may need sponsorship later</option><option value="not_needed">I do not need sponsorship</option></select></label><label className="checkbox-label"><input type="checkbox" checked={hideNo} onChange={event => { invalidate(); setHideNo(event.target.checked); }}/>Hide adverts saying no sponsorship</label></div><p>Visa category alone does not establish eligibility. Check your actual permission conditions and the employer’s offer.</p></details>
    </form>
    {!cvText && <p className="job-search-hint">This shortlist uses your role search and sponsorship preferences. Add a CV in the workspace for a personal skill comparison.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {saveMessage && <div role="status" className="save-job-status">{saveMessage}<Link href="/applications/">View board <Icon name="arrow" size={14}/></Link></div>}
    {results && cvText && <p className="comparison-coverage">Checked {results.listings_checked} public listings. Compared requirements for {results.compared_count ?? 0} roles after location, title and career-stage filters. {results.senior_roles_excluded ? `${results.senior_roles_excluded} senior roles excluded.` : ""} This is evidence of fit, not a prediction of getting hired.</p>}
    {busy && <p role="status" className="job-search-hint">Checking the connected public sources. Your CV is never sent to job platforms.</p>}
    {results && <><div className="job-results-heading"><h2>{results.total_matches ? `${results.total_matches} roles to explore` : "No roles found in these sources"}</h2><span>Checked {new Date(results.searched_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}</span></div>
      {!results.jobs.length && <p className="quiet-message">Try a broader role or another country. The links below search more platforms directly.</p>}
      <div className="job-results">{results.jobs.map((job, index) => <article className="job-result-card" key={job.id}><div className="job-company-avatar" aria-hidden="true">{job.company.slice(0, 1)}</div><div className="job-result-main"><div className="job-result-title"><div><span>{job.company}</span><h3>{job.title}</h3></div>{cvText && job.fit_label && <span className="job-fit-label">{job.fit_label}<small>{job.core_found} of {job.core_total} core skills supported</small></span>}</div><p className="job-location"><Icon name="location" size={14}/>{job.location || "Location not specified"}<span>{job.provider}</span></p><span className={`sponsorship-pill ${job.sponsorship_status === "not_offered" ? "no" : job.sponsor_entities.length || job.sponsorship_status === "offered" ? "evidence" : "unknown"}`}><Icon name="shield" size={13}/>{need === "not_needed" ? "Confirm your work permission" : job.sponsorship_label}</span>
        {cvText && job.skill_evidence?.length ? <SkillRequirements compact checks={job.skill_evidence.map((item, skillIndex) => ({ id: `${job.id}-${skillIndex}`, label: item.skill, state: evidenceState(item.status, item.status, item.cv_excerpt), source: item.job_excerpt, evidence: item.cv_excerpt, line: item.line, priority: item.priority }))} onReview={onSelect ? () => onSelect(job.description) : undefined}/> : job.matched_skills.length > 0 && <div className="job-skill-tags">{job.matched_skills.slice(0, 4).map(skill => <span key={skill}><Icon name="check" size={11}/>{skill}</span>)}</div>}
        <div className="job-result-actions"><a href={job.url} target="_blank" rel="noopener noreferrer">{job.provider === "remotive" ? "View on Remotive" : "Open job advert"} <Icon name="arrow" size={14}/></a><button type="button" className={`save-job-button ${savedJobs.some(saved => saved.url === job.url) ? "saved" : ""}`} aria-label={`Save ${job.title} at ${job.company}`} disabled={savedJobs.some(saved => saved.url === job.url)} onClick={() => saveJob(job)}><Icon name={savedJobs.some(saved => saved.url === job.url) ? "check" : "bookmark"} size={14}/>{savedJobs.some(saved => saved.url === job.url) ? "Saved" : "Save job"}</button><button className="text-button" type="button" aria-expanded={openJob === job.id} onClick={() => setOpenJob(openJob === job.id ? null : job.id)}>Why this role?</button>{onSelect && <button type="button" className="text-button" onClick={() => onSelect(job.description)}>Show exact CV changes</button>}</div>
        {openJob === job.id && <div className="job-detail"><ul>{job.why.map(text => <li key={text}>{text}</li>)}</ul>{job.skill_evidence && <div className="job-evidence-list">{job.skill_evidence.map(item => <div key={item.skill}><strong>{item.skill}<span>{item.status === "not_found" ? "Not found" : item.status === "mentioned" ? "Listed only" : "Work evidence"}</span></strong><p><b>Job:</b> {item.job_excerpt}</p>{item.cv_excerpt ? <blockquote>CV line {item.line}: {item.cv_excerpt}</blockquote> : <p>No supporting CV passage found.</p>}</div>)}</div>}{job.hard_checks && job.hard_checks.length > 0 && <div className="role-barriers"><strong>Other requirements to confirm</strong><ul>{job.hard_checks.map(check => <li key={check}>{check}</li>)}</ul></div>}{job.sponsorship_quote && <blockquote>{job.sponsorship_quote}</blockquote>}{job.sponsor_entities.map(entity => <p key={entity.legal_name}><strong>{entity.legal_name}</strong> · {entity.route}<br/>{job.sponsor_source && <a href={job.sponsor_source} target="_blank" rel="noopener noreferrer">Official register · {job.sponsor_source_date ?? "date unavailable"}</a>}</p>)}<p><strong>Before applying:</strong> {job.next_action}</p>{index === 0 && <p className="job-shortlist-note">Ranked from the sources checked, not a guarantee that this is the best employer or that you will get an interview.</p>}</div>}
      </div></article>)}</div>
      <details className="source-coverage"><summary>Sources checked and visa guidance</summary><p>{results.coverage}</p><ul>{results.sources.map(source => <li key={`${source.company}-${source.provider}`}>{source.company} · {source.provider} · {source.status === "checked" ? `${source.count} public listings` : "unavailable this time"}</li>)}</ul><p>{results.visa_note}</p>{results.visa_guidance_url && <a href={results.visa_guidance_url} target="_blank" rel="noopener noreferrer">Official visa guidance</a>}</details>
    </>}
    <div className="more-job-platforms"><span>Search more platforms</span>{(results?.more_platforms ?? platformLinks(query, country)).map(link => <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer">{link.name}<Icon name="arrow" size={13}/></a>)}<small>Opens a separate search. These platforms are not included in our result count.</small></div>
  </section>;
}

function platformLinks(query: string, country: string) { return [{ name: "Handshake · ARU", url: "https://aru.joinhandshake.com/" }, { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location: country })}` }, { name: "Indeed", url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: country })}` }]; }

function matchesCountry(location: string, country: string) {
  if (country === "Any") return true;
  if (country === "United Kingdom") return !(/\b(canada|ontario|united states|usa|germany)\b/i.test(location) && !/\b(united kingdom|uk|england)\b/i.test(location)) && /\b(united kingdom|uk|england|scotland|wales|northern ireland|london|manchester|edinburgh|birmingham|bristol|cambridge|leeds)\b/i.test(location);
  return location.toLowerCase().includes(country.toLowerCase());
}
