"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_URL, DEMO_MODE } from "../api-config";
import { readResponse } from "../review-types";
import { useCVSession } from "../cv-session";
import { Icon } from "../components/icons";

type Status = { configured: boolean; verified: boolean; model: string };
export default function Connections() {
  const session = useCVSession();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => { if (DEMO_MODE) return; const abort = new AbortController(); fetch(`${API_URL}/api/ai/status`, { signal: abort.signal }).then(readResponse).then(data => setStatus(data as Status)).catch(() => setError("Cannot reach the local backend.")); return () => { abort.abort(); request.current?.abort(); }; }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); if (busy || DEMO_MODE) return;
    const secret = key.trim(); setKey(""); setBusy(true); setMessage(""); setError(""); setDiagnostic("");
    const abort = new AbortController(); request.current = abort; const timeout = setTimeout(() => abort.abort(), 80_000);
    try {
      const response = await fetch(`${API_URL}/api/ai/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: secret }), signal: abort.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.code === "string" && /^[A-Z_]{1,40}$/.test(data.code)) {
          setDiagnostic(`Connection code: ${data.code}${Number.isInteger(data.provider_status) ? ` · Google HTTP ${data.provider_status}` : ""}`);
        }
        throw new Error(typeof data?.detail === "string" ? data.detail : "The local backend could not connect Gemini. Re-enter your key to try again.");
      }
      const data = await readResponse(response);
      setStatus(data as Status); session.setProvider("gemini");
      setMessage("Gemini connection verified using a synthetic prompt. No CV was sent. Open CV review and choose whether to use Gemini.");
    }
    catch (err) {
      setError(abort.signal.aborted ? "The connection check timed out. Re-enter your key to try again, or choose local review."
        : err instanceof TypeError ? "Cannot reach the local backend. Start the local app, then re-enter your key to try again."
        : err instanceof Error ? err.message : "Could not connect Gemini.");
    }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  async function disconnect() { try { const data = await readResponse(await fetch(`${API_URL}/api/ai/disconnect`, { method: "POST" })); setStatus(data as Status); session.setProvider("local"); setMessage("Gemini disconnected. Local review is selected."); } catch { setError("Could not disconnect. Restart the backend to clear a key entered here."); } }
  async function copyPrompt() {
    const prompt = `Review this CV. Identify demonstrated skills from the work and projects, not only keywords. Give exact current lines, proposed replacements grounded only in those lines, and duplicate/generic lines to delete. Ask for missing facts instead of inventing achievements. Do not invent a hiring probability. If a job advert follows, compare every actual requirement with quoted CV evidence.\n\nCV:\n${session.text || "[Paste an anonymised CV here]"}\n\nJOB ADVERT (optional):\n${session.target?.description || "[Paste the advert here for role-specific advice]"}`;
    try { await navigator.clipboard.writeText(prompt); setMessage("Prompt copied locally. Review or anonymise it before pasting into the Gemini app. Nothing was sent automatically."); } catch { setError("Clipboard unavailable. You can enter your CV and these review instructions directly in Gemini."); }
  }
  return <main className="hub-page connections-page"><div className="page-heading"><div><p className="eyebrow">YOUR TOOLS, CLEARLY CONNECTED</p><h1>Choose how your CV is reviewed.</h1><p>Local by default. Gemini only when you choose to send a document.</p></div><Link className="secondary-button" href="/workspace/">Back to CV review <Icon name="arrow" size={16}/></Link></div>
    <section className="panel gemini-connection"><div className="panel-heading"><div><h2>Gemini API</h2><p>{status?.verified ? "Connection verified" : status?.configured ? "Key configured; not yet verified in this session" : "Not connected"}</p></div><span className="subtle-badge">{status?.verified ? "Connected" : "Optional"}</span></div><p>Your Gemini Plus app subscription and the developer API are separate. Create a key in <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Choose a Free Tier project if you want to avoid paid API usage; your project settings determine charges.</p>
      {DEMO_MODE ? <p className="quiet-message">API keys can be connected only in the local application, not this public preview.</p> : <form onSubmit={connect}><label>Gemini API key<input type="password" value={key} onChange={e => setKey(e.target.value)} minLength={12} maxLength={300} required autoComplete="off" spellCheck={false} placeholder="Enter privately here, never in chat" disabled={busy}/></label><div><button className="primary-button" disabled={busy || key.length < 12} type="submit">{busy ? "Checking connection…" : "Connect and test key"}<Icon name="shield" size={16}/></button>{status?.configured && <button type="button" className="secondary-button" onClick={disconnect} disabled={busy}>Disconnect</button>}</div><p className="field-note">One small synthetic prompt checks the connection. Your key stays in backend memory, is not written to project files, and is cleared when the backend restarts. No CV is sent by this form.</p></form>}
    </section>
    {error && <p className="error-message" role="alert">{error}{diagnostic && <><br/><small>{diagnostic}</small></>}</p>}{message && <p className="inline-status" role="status">{message}</p>}
    <section className="panel gemini-handoff"><Icon name="spark" size={23}/><div><h2>Use your existing Gemini Plus app</h2><p>Copy a review prompt, then paste it into Gemini yourself. This does not connect the API or send your CV automatically.</p><div><button className="secondary-button" type="button" onClick={copyPrompt}>Copy review prompt</button><a className="secondary-button" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">Open Gemini app <Icon name="external" size={14}/></a></div></div></section>
    <div className="section-label"><h2>Your job platforms</h2><span>Sign in on the original websites</span></div><section className="platform-grid">{[
      { name: "LinkedIn", mark: "in", href: "https://www.linkedin.com/", description: "Your professional profile and job search." },
      { name: "Indeed", mark: "i", href: "https://uk.indeed.com/", description: "Search roles and use your existing Indeed account." },
      { name: "Handshake · ARU", mark: "H", href: "https://aru.joinhandshake.com/", description: "Anglia Ruskin University’s student and graduate opportunities. Use your ARU login." },
    ].map(platform => <article className="panel platform-card" key={platform.name}><span className="platform-mark">{platform.mark}</span><h3>{platform.name}</h3><p>{platform.description}</p><a href={platform.href} target="_blank" rel="noopener noreferrer">Open official sign-in <Icon name="external" size={14}/></a><small>External account · no automatic sync</small></article>)}</section><div className="platform-note"><p>After signing in, copy an advert’s text into CV review to compare it with your CV. These accounts are not automatically synced with CareerPilot.</p><details><summary>Why account sync is separate</summary><p>LinkedIn and Indeed API integrations need provider approval. Handshake restricts API access to career-services partners. CareerPilot does not ask for your platform passwords or import private listings without authorised access.</p><a href="https://www.aru.ac.uk/student-life/support-and-facilities/careers-and-employability/find-work-and-develop-skills/gaining-graduate-employment" target="_blank" rel="noopener noreferrer">ARU’s Handshake guidance</a></details></div>
  </main>;
}
