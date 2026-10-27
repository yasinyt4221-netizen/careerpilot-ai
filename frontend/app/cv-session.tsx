"use client";
import { createContext, useContext, useState } from "react";

type Target = { description: string; title: string; company: string };
type Session = { text: string; filename: string; setCV: (text: string, filename: string) => void; target: Target | null; setTarget: (target: Target | null) => void; provider: "local" | "gemini"; setProvider: (provider: "local" | "gemini") => void };
const Context = createContext<Session | null>(null);
export function CVSessionProvider({ children }: { children: React.ReactNode }) {
  const [cv, setCV] = useState({ text: "", filename: "" });
  const [target, setTarget] = useState<Target | null>(null);
  const [provider, setProvider] = useState<"local" | "gemini">("local");
  return <Context.Provider value={{ ...cv, setCV: (text, filename) => setCV({ text, filename }), target, setTarget, provider, setProvider }}>{children}</Context.Provider>;
}
export function useCVSession() { const value = useContext(Context); if (!value) throw new Error("CV session is unavailable"); return value; }
