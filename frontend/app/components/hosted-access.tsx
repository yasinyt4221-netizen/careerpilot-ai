"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL, BASE_PATH, HOSTED_MODE, setAccessToken } from "../api-config";
import { useCVSession } from "../cv-session";
import { Rocket } from "./icons";

export default function HostedAccess({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const pathname = BASE_PATH && path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) || "/" : path;
  const session = useCVSession();
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const expire = () => { setAccessToken(""); setConnected(false); session.setCV("", ""); session.setTarget(null); };
    window.addEventListener("careerpilot-access-expired", expire);
    return () => window.removeEventListener("careerpilot-access-expired", expire);
  }, [session]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const secret = code; setCode(""); setBusy(true); setError("");
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 80_000);
    try {
      const response = await fetch(`${API_URL}/api/access/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_code: secret }), signal: abort.signal, credentials: "omit" });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.token !== "string") throw new Error(typeof data?.detail === "string" ? data.detail : "Could not open the private workspace.");
      setAccessToken(data.token); setConnected(true);
    } catch (err) { setError(abort.signal.aborted ? "The backend is taking too long to wake up. Try again shortly." : err instanceof TypeError ? "Cannot reach the hosted backend. Check the deployment or try again shortly." : err instanceof Error ? err.message : "Could not open the workspace."); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  if (!HOSTED_MODE || pathname === "/" || pathname.startsWith("/help") || connected) return <>{children}</>;
  return <main className="private-access"><Link href="/" className="private-access-brand"><Rocket/>CareerPilot AI</Link><section className="panel"><p className="eyebrow">YOUR PRIVATE WORKSPACE</p><h1>A clearer next step.</h1><p>Enter the access code shared by the owner to review a CV and find relevant jobs.</p><form onSubmit={login}><label htmlFor="workspace-code">Workspace access code</label><input id="workspace-code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} maxLength={200} required disabled={busy}/><button className="primary-button" disabled={busy || !code} type="submit">{busy ? "Opening workspace…" : "Open workspace"}</button></form>{error && <p role="alert" className="error-message">{error}</p>}<small>Access lasts for one hour in this tab. CV text is kept in memory. Gemini review asks for your consent before sending document text to Google.</small><Link href="/help/">Privacy and data controls</Link></section></main>;
}
