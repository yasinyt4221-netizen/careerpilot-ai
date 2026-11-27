"use client";

import { useSyncExternalStore } from "react";
import { API_URL, DEMO_MODE, apiFetch } from "./api-config";
import { readResponse } from "./review-types";

export type SyncStatus = "idle" | "saving" | "saved" | "error";
export type Account = { token: string; email: string; sync: SyncStatus };
const KEY = "careerpilot.account.v1";
const EVENT = "careerpilot-account";
let account: Account | null = null;
let loaded = false;

export const ACCOUNTS_AVAILABLE = !DEMO_MODE;

export function getAccount() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object" && typeof (saved as Account).token === "string" && typeof (saved as Account).email === "string")
        account = { token: (saved as Account).token, email: (saved as Account).email, sync: "idle" };
    } catch { /* Storage blocked: the account lasts for this tab only. */ }
  }
  return account;
}
function setAccount(next: Account | null) {
  const persist = !account || !next || account.token !== next.token;
  account = next;
  if (persist) try { if (next) window.localStorage.setItem(KEY, JSON.stringify({ token: next.token, email: next.email })); else window.localStorage.removeItem(KEY); } catch { /* tab-only */ }
  window.dispatchEvent(new Event(EVENT));
}
export function setSyncStatus(sync: SyncStatus) { if (account && account.sync !== sync) setAccount({ ...account, sync }); }
function subscribe(listener: () => void) { window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener); }
export function useAccount() { return useSyncExternalStore(subscribe, getAccount, () => null); }

export async function accountFetch(path: string, init: RequestInit = {}) {
  const current = getAccount();
  const headers = new Headers(init.headers);
  if (current) headers.set("X-Account-Token", current.token);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await apiFetch(`${API_URL}/api/account${path}`, { ...init, headers });
  if (response.status === 401 && current) setAccount(null);
  return readResponse(response);
}

export async function signIn(mode: "login" | "register", email: string, password: string) {
  const data = await accountFetch(`/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) }) as { token: string; email: string };
  setAccount({ token: data.token, email: data.email, sync: "idle" });
}
export async function signOut() {
  try { await accountFetch("/logout", { method: "POST" }); } finally { setAccount(null); }
}
export async function deleteAccount() {
  await accountFetch("", { method: "DELETE" });
  setAccount(null);
}
