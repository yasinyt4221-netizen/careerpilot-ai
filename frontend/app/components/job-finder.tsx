"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL, DEMO_MODE, publicAsset } from "../api-config";
import { readResponse } from "../review-types";
import { Icon } from "./icons";

type Job = {
  id: string; company: string; title: string; location: string; url: string; provider: string; description: string;
  skill_score: number | null; matched_skills: string[]; missing_skills: string[]; sponsorship_status: string;
  sponsorship_label: string; sponsorship_quote: string | null; why: string[]; next_action: string;
  sponsor_entities: { legal_name: string; route: string; rating: string }[]; sponsor_source: string | null; sponsor_source_date: string | null;
  country_hint?: string | null;
};
type Results = { jobs: Job[]; total_matches: number; listings_checked: number; sources: { company: string; provider: string; status: string; count: number }[]; searched_at: string; coverage: string; visa_note: string; more_platforms: { name: string; url: string }[]; visa_guidance_url: string | null; register_available: boolean };
const safeUrl = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
function isResults(value: unknown): value is Results {
  if (value === null || typeof value !== "object") return false;
  const data = value as Results;
  return Array.isArray(data.jobs) && data.jobs.every(job => typeof job.title === "string" && typeof job.company === "string" && typeof job.url === "string" && safeUrl(job.url) && typeof job.description === "string" && Array.isArray(job.matched_skills) && Array.isArray(job.missing_skills) && typeof job.sponsorship_label === "string" && Array.isArray(job.why)) && Array.isArray(data.sources) && typeof data.coverage === "string" && typeof data.visa_note === "string" && typeof data.searched_at === "string" && Array.isArray(data.more_platforms) && data.more_platforms.every(link => safeUrl(link.url));
}

export default function JobFinder({ cvText = "", onSelect }: { cvText?: string; onSelect?: (description: string) => void }) {
  const [query, setQuery] = useState("Software engineer");
  const [country, setCountry] = useState("United Kingdom");
  const [visa, setVisa] = useState("");
  const [need, setNeed] = useState("unknown");
  const [hideNo, setHideNo] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { const previous = request.current; request.current = null; previous?.abort(); }, []);

  function invalidate() { const previous = request.current; request.current = null; previous?.abort(); setBusy(false); setResults(null); setError(""); }

  async function search(event: React.FormEvent) {
    event.preventDefault(); if (busy || query.trim().length < 2) return;
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
        const response = await fetch(`${API_URL}/api/jobs/search`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ query: query.trim(), country, visa_category: visa, sponsorship_need: need, hide_no_sponsorship: hideNo, cv_text: cvText, limit: 25 }) });
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

  return <section className="job-discovery" aria-labelledby="jobs-heading"><div className="job-discovery-heading"><div><p className="eyebrow">YOUR NEXT OPPORTUNITY</p><h1 id="jobs-heading">Find roles worth applying for.</h1><p>Compare your skills. Check sponsorship evidence. Go to the original advert.</p></div><span className="job-source-badge"><Icon name="briefcase" size={16}/>{DEMO_MODE && !API_URL ? "Published job feed" : "Public company feeds"}</span></div>
    <form className="job-search-form" onSubmit={search} aria-busy={busy}><div className="job-search-main"><label>Role or keywords<input value={query} onChange={event => { invalidate(); setQuery(event.target.value); }} maxLength={100} placeholder="e.g. Data analyst" required minLength={2}/></label><label>Job country<select aria-label="Job country" value={country} onChange={event => { invalidate(); setCountry(event.target.value); }}>{["United Kingdom", "Ireland", "Germany", "Netherlands", "United States", "Canada", "Australia", "Any"].map(value => <option key={value}>{value}</option>)}</select></label><button className="primary-button" type="submit" disabled={busy || query.trim().length < 2}>{busy ? "Checking job boards…" : "Find jobs"}<Icon name="arrow" size={17}/></button></div>
      <details className="visa-profile" open><summary><Icon name="shield" size={16}/>Your work permission</summary><div><label>Visa or work permission <span>(optional)</span><input value={visa} maxLength={100} placeholder="e.g. Graduate visa" onChange={event => { invalidate(); setVisa(event.target.value); }}/></label><label>Employer sponsorship<select aria-label="Employer sponsorship" value={need} onChange={event => { invalidate(); setNeed(event.target.value); }}><option value="unknown">I need to check</option><option value="now">I need sponsorship now</option><option value="later">I may need sponsorship later</option><option value="not_needed">I do not need sponsorship</option></select></label><label className="checkbox-label"><input type="checkbox" checked={hideNo} onChange={event => { invalidate(); setHideNo(event.target.checked); }}/>Hide adverts saying no sponsorship</label></div><p>Visa category alone does not establish eligibility. Check your actual permission conditions and the employer’s offer.</p></details>
    </form>
    {!cvText && <p className="job-search-hint">This shortlist uses your role search and sponsorship preferences. Add a CV in the workspace for a personal skill comparison.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {busy && <p role="status" className="job-search-hint">Checking the connected public sources. Your CV is never sent to job platforms.</p>}
    {results && <><div className="job-results-heading"><h2>{results.total_matches ? `${results.total_matches} roles to explore` : "No roles found in these sources"}</h2><span>Checked {new Date(results.searched_at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}</span></div>
      {!results.jobs.length && <p className="quiet-message">Try a broader role or another country. The links below search more platforms directly.</p>}
      <div className="job-results">{results.jobs.map((job, index) => <article className="job-result-card" key={job.id}><div className="job-company-avatar" aria-hidden="true">{job.company.slice(0, 1)}</div><div className="job-result-main"><div className="job-result-title"><div><span>{job.company}</span><h3>{job.title}</h3></div>{job.skill_score !== null && <span className="skill-fit-score">{job.skill_score}<small>/100 skills</small></span>}</div><p className="job-location"><Icon name="location" size={14}/>{job.location || "Location not specified"}<span>{job.provider}</span></p><span className={`sponsorship-pill ${job.sponsorship_status === "not_offered" ? "no" : job.sponsor_entities.length || job.sponsorship_status === "offered" ? "evidence" : "unknown"}`}><Icon name="shield" size={13}/>{need === "not_needed" ? "Confirm your work permission" : job.sponsorship_label}</span>
        {job.matched_skills.length > 0 && <div className="job-skill-tags">{job.matched_skills.slice(0, 4).map(skill => <span key={skill}><Icon name="check" size={11}/>{skill}</span>)}</div>}
        <div className="job-result-actions"><a href={job.url} target="_blank" rel="noopener noreferrer">{job.provider === "remotive" ? "View on Remotive" : "Open job advert"} <Icon name="arrow" size={14}/></a><button className="text-button" type="button" aria-expanded={openJob === job.id} onClick={() => setOpenJob(openJob === job.id ? null : job.id)}>Why this role?</button>{onSelect && <button type="button" className="text-button" onClick={() => onSelect(job.description)}>Review CV for this job</button>}</div>
        {openJob === job.id && <div className="job-detail"><ul>{job.why.map(text => <li key={text}>{text}</li>)}</ul>{job.sponsorship_quote && <blockquote>{job.sponsorship_quote}</blockquote>}{job.sponsor_entities.map(entity => <p key={entity.legal_name}><strong>{entity.legal_name}</strong> · {entity.route}<br/>{job.sponsor_source && <a href={job.sponsor_source} target="_blank" rel="noopener noreferrer">Official register · {job.sponsor_source_date ?? "date unavailable"}</a>}</p>)}<p><strong>Before applying:</strong> {job.next_action}</p>{index === 0 && <p className="job-shortlist-note">Ranked from the sources checked, not a guarantee that this is the best employer or that you will get an interview.</p>}</div>}
      </div></article>)}</div>
      <details className="source-coverage"><summary>Sources checked and visa guidance</summary><p>{results.coverage}</p><ul>{results.sources.map(source => <li key={`${source.company}-${source.provider}`}>{source.company} · {source.provider} · {source.status === "checked" ? `${source.count} public listings` : "unavailable this time"}</li>)}</ul><p>{results.visa_note}</p>{results.visa_guidance_url && <a href={results.visa_guidance_url} target="_blank" rel="noopener noreferrer">Official visa guidance</a>}</details>
    </>}
    <div className="more-job-platforms"><span>Search more platforms</span>{(results?.more_platforms ?? platformLinks(query, country)).map(link => <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer">{link.name}<Icon name="arrow" size={13}/></a>)}<small>Opens a separate search. These platforms are not included in our result count.</small></div>
  </section>;
}

function platformLinks(query: string, country: string) { return [{ name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location: country })}` }, { name: "Indeed", url: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: country })}` }]; }

function matchesCountry(location: string, country: string) {
  if (country === "Any") return true;
  if (country === "United Kingdom") return !(/\b(canada|ontario|united states|usa|germany)\b/i.test(location) && !/\b(united kingdom|uk|england)\b/i.test(location)) && /\b(united kingdom|uk|england|scotland|wales|northern ireland|london|manchester|edinburgh|birmingham|bristol|cambridge|leeds)\b/i.test(location);
  return location.toLowerCase().includes(country.toLowerCase());
}
