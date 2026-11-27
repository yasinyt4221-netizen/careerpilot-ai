"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCOUNTS_AVAILABLE, deleteAccount, signIn, signOut, useAccount } from "../account";
import { syncWithAccount, useApplications } from "../application-store";
import { Icon } from "../components/icons";

const SYNC_LABEL = { idle: "Ready", saving: "Saving…", saved: "Saved to your account", error: "Not saved. Check the backend connection." };

export default function Account() {
  const account = useAccount();
  const jobs = useApplications();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(done); }
    catch (err) { setError(err instanceof TypeError ? "Cannot reach the backend. Start the local app and try again." : err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    run(async () => { await signIn(mode, email.trim(), password); setPassword(""); await syncWithAccount(); },
      mode === "register" ? "Account created. Your board is now saved to it." : "Signed in. Your board has been merged with your account copy.");
  }

  return <main className="hub-page account-page"><div className="page-heading"><div><p className="eyebrow">KEEP YOUR BOARD WITH YOU</p><h1>{account ? "Your account" : "Sign in to save your board."}</h1><p>Optional. Without an account, saved roles stay in this browser only.</p></div></div>
    {!ACCOUNTS_AVAILABLE ? <section className="panel account-panel"><p className="quiet-message">Accounts need the HireReady backend. The public showcase keeps everything in this browser; run the local app to try accounts.</p></section>
    : account ? <section className="panel account-panel">
        <div className="panel-heading"><div><h2>{account.email}</h2><p>{jobs.length} saved {jobs.length === 1 ? "role" : "roles"} · {SYNC_LABEL[account.sync]}</p></div><span className="subtle-badge">Signed in</span></div>
        <p>Saved roles, stages, notes and dates are copied to your account so they reappear when you sign in on another browser. CV text and drafts are never stored.</p>
        <div className="data-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={() => run(syncWithAccount, "Board synced with your account.")}><Icon name="download" size={16}/>Sync now</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => run(signOut, "Signed out. Roles saved on this browser stay here.")}>Sign out</button>
          <button className="danger-button" type="button" disabled={busy} onClick={() => setConfirm(true)}><Icon name="trash" size={16}/>Delete account</button>
        </div>
        {confirm && <div className="delete-confirm"><p>Permanently delete your account and its saved board from the server? Roles on this browser are kept. This cannot be undone.</p><button className="danger-button" type="button" disabled={busy} onClick={() => { setConfirm(false); run(deleteAccount, "Your account and its server data have been deleted."); }}>Delete permanently</button><button className="secondary-button" type="button" onClick={() => setConfirm(false)}>Cancel</button></div>}
      </section>
    : <section className="panel account-panel">
        <div className="account-tabs" role="tablist" aria-label="Account action">{(["login", "register"] as const).map(option => <button key={option} type="button" role="tab" aria-selected={mode === option} onClick={() => { setMode(option); setError(""); }}>{option === "login" ? "Sign in" : "Create account"}</button>)}</div>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" disabled={busy}/></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"} disabled={busy}/></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="shield" size={16}/></button>
          <p className="field-note">{mode === "register" ? "At least 10 characters. Passwords are stored as salted scrypt hashes. " : ""}Roles already on this browser are merged into your account when you sign in.</p>
        </form>
      </section>}
    {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="inline-status" role="status">{message}</p>}
    <div className="help-links"><Link href="/help/">Help & privacy <Icon name="arrow" size={15}/></Link><Link href="/applications/">Open applications <Icon name="arrow" size={15}/></Link></div>
  </main>;
}
