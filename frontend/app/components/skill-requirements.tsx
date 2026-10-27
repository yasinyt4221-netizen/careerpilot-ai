"use client";
import { useId, useState } from "react";
import { Icon } from "./icons";

export type SkillCheck = {
  id: string; label: string; state: "found" | "listed" | "related" | "missing";
  source: string; evidence: string | null; line?: number | null; priority?: string;
};
const captions = { found: "Found in CV", listed: "Listed only", related: "Check evidence", missing: "Not shown in CV" };
export function evidenceState(status: string, evidenceStatus: string | undefined, evidence: string | null): SkillCheck["state"] {
  if (!evidence || status === "not_found") return "missing";
  if (evidenceStatus === "mentioned" || status === "mentioned") return "listed";
  if (status === "related" || evidenceStatus === "related") return "related";
  return "found";
}

export default function SkillRequirements({ checks, onReview, onUpdateCV, compact = false }: {
  checks: SkillCheck[]; onReview?: (id: string) => void; onUpdateCV?: () => void; compact?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  if (!checks.length) return null;
  const active = checks.find(check => check.id === selected);
  const found = checks.filter(check => check.state === "found").length;
  const allSupported = checks.every(check => check.state === "found");
  const visible = expanded ? checks : checks.slice(0, compact ? 6 : 10);
  return <section className={`skill-requirements ${compact ? "compact" : ""}`} aria-label="What they're looking for">
    <h2>What they’re looking for</h2>
    <p className="skill-match-summary">{allSupported ? "Your CV supports these requirements." : found ? "You match some requirements. Select a badge to see the gaps." : "Your CV needs clearer evidence for these requirements."}</p>
    <div className="requirement-badges">{visible.map(check => <button key={check.id} type="button" className={`requirement-badge ${check.state}`} aria-label={`${check.label}: ${captions[check.state]}`} aria-expanded={selected === check.id} aria-controls={detailId} onClick={() => setSelected(selected === check.id ? null : check.id)}>
      <span className="requirement-symbol"><Icon name={check.state === "found" ? "check" : check.state === "listed" ? "edit" : check.state === "related" ? "help" : "missing"} size={16}/></span>
      <span>{check.label}<small>{captions[check.state]}</small></span>
    </button>)}</div>
    {checks.length > visible.length && <button className="text-button skill-show-all" type="button" onClick={() => setExpanded(true)}>Show all {checks.length} requirements</button>}
    {active && <div className={`skill-check-detail ${active.state}`} id={detailId}>
      <div><strong>{active.label}</strong><span>{captions[active.state]}{active.priority === "preferred" ? " · Preferred" : active.priority === "required" ? " · Required" : ""}</span></div>
      <p><b>Job asks:</b> {active.source}</p>
      {active.evidence ? <blockquote><small>YOUR CV{active.line ? ` · LINE ${active.line}` : ""}</small>{active.evidence}</blockquote> : <p>No supporting passage was found in this CV.</p>}
      <p className="skill-next-action">{active.state === "missing" ? `If you have used ${active.label}, add one real example under Projects or Experience: what you did, the tool used and the outcome. If you haven’t, leave it off your CV.` : active.state === "listed" ? `Add a work or project bullet showing how you used ${active.label}. A skill name alone does not show the employer what you did.` : active.state === "related" ? "Confirm whether this work meets the requirement. Clarify your role using facts from your own experience." : "Keep this evidence. It supports the requirement in the advert."}</p>
      {onReview && active.state !== "found" && <button type="button" className="text-button" onClick={() => onReview(active.id)}>See what to change <Icon name="arrow" size={14}/></button>}
    </div>}
    <p className="skill-match-footnote">Based on this CV and the job advert.{onUpdateCV && <button type="button" onClick={onUpdateCV}>Update CV</button>}</p>
  </section>;
}
