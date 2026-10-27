"use client";
import JobFinder from "../components/job-finder";
import { useCVSession } from "../cv-session";
import { useRouter } from "next/navigation";
import { DEMO_MODE } from "../api-config";

export default function Jobs() { const session = useCVSession(); const router = useRouter(); return <main className="workspace jobs-workspace"><JobFinder cvText={DEMO_MODE ? "" : session.text} onSelect={!DEMO_MODE && session.text ? description => { session.setTarget({ description, title: "Selected role", company: "" }); router.push("/workspace/"); } : undefined}/></main>; }
