"use client";

import { useState } from "react";
import { downloadText, useApplications } from "../application-store";
import { Icon } from "../components/icons";

type Tool = "interview" | "letter" | "followup";
const STAR = [
  { name: "Situation", hint: "Set the scene. What was happening?", placeholder: "Describe a real project, team or problem…", letter: "S" },
  { name: "Task", hint: "What were you responsible for?", placeholder: "What did you need to achieve?", letter: "T" },
  { name: "Action", hint: "Explain what you personally did.", placeholder: "The steps you took, the tools you used, the choices you made…", letter: "A" },
  { name: "Result", hint: "What happened? Use only facts you can support.", placeholder: "A real outcome, feedback or lesson. A number is optional.", letter: "R" },
];
const questionsFor = (role: string) => {
  const specific = /engineer|developer/i.test(role) ? "Walk me through a technical decision you made and the trade-offs you considered." : /design/i.test(role) ? "Tell me about a design choice you changed after feedback or user research." : /analyst|data|scientist/i.test(role) ? "Tell me about a time you turned messy data into a useful decision." : "Tell me about a project where your work made a useful difference.";
  return [specific, "Describe a time you solved a problem with limited information.", "Tell me about working with someone who had a different perspective.", "Describe a mistake, what you changed and what you learned.", "Why does this role interest you, and which real experience supports your fit?"];
};

export default function Prepare() {
  const jobs = useApplications();
  const [tool, setTool] = useState<Tool>("interview");
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState("Data Analyst");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [motivation, setMotivation] = useState("");
  const [evidence, setEvidence] = useState("");
  const [date, setDate] = useState("");
  const [question, setQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const star = answers[question] ?? ["", "", "", ""];
  function setStar(update: (previous: string[]) => string[]) { setAnswers(previous => ({ ...previous, [question]: update(previous[question] ?? ["", "", "", ""]) })); }
  const [message, setMessage] = useState("");
  const [example, setExample] = useState(false);
  const questions = questionsFor(role);
  const complete = star.filter(value => value.trim().length > 0).length;
  const answer = STAR.map((part, index) => star[index].trim() ? `${part.name}\n${star[index].trim()}` : "").filter(Boolean).join("\n\n");
  const letterReady = [role, company, name, motivation, evidence].every(value => value.trim());
  const followupReady = [role, company, name, date].every(value => value.trim());
  const letter = letterReady ? `Dear hiring team at ${company.trim()},\n\nI am applying for the ${role.trim()} role. ${motivation.trim()}\n\n${evidence.trim()}\n\nI would welcome the opportunity to discuss how this experience relates to your team's needs. Thank you for considering my application.\n\nKind regards,\n${name.trim()}` : "";
  const followup = followupReady ? `Subject: Following up — ${role.trim()} application\n\nHello ${company.trim()} hiring team,\n\nI applied for the ${role.trim()} role on ${new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} and wanted to ask whether there is an update on the process. I remain interested in the opportunity and would be happy to provide any further information.\n\nThank you for your time.\n\nKind regards,\n${name.trim()}` : "";
  const output = tool === "interview" ? answer : tool === "letter" ? letter : followup;
  function tabKeys(event: React.KeyboardEvent) {
    const tools: Tool[] = ["interview", "letter", "followup"];
    const index = tools.indexOf(tool);
    const next = event.key === "ArrowRight" ? (index + 1) % tools.length : event.key === "ArrowLeft" ? (index + tools.length - 1) % tools.length : event.key === "Home" ? 0 : event.key === "End" ? tools.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTool(tools[next]); setMessage("");
    requestAnimationFrame(() => document.getElementById(`tab-${tools[next]}`)?.focus());
  }
  async function copy() { try { await navigator.clipboard.writeText(`${example ? "FICTIONAL PRACTICE EXAMPLE — replace with your own facts.\n\n" : ""}${output}`); setMessage("Draft copied. Review it before using it."); } catch { setMessage("Clipboard unavailable. Use Download text instead."); } }
  function loadExample() { setExample(true); setQuestion(0); setAnswers({ 0: ["In a fictional practice project, a team used several spreadsheets for monthly reporting.", "I was asked to make the reporting process easier to follow.", "I compared the sheets, checked inconsistent entries with the team and built a simple dashboard showing the agreed measures.", "The team could review the figures in one place. I learned to agree definitions before building a report."] }); setName("Sample Applicant"); setCompany("Northstar Labs"); setRole("Data Analyst"); setMotivation("I am interested in work that turns reporting into practical decisions."); setEvidence("In a fictional practice project, I brought reporting spreadsheets into a simple dashboard and checked the definitions with the team."); setDate(new Date().toLocaleDateString("en-CA")); setMessage("Fictional practice content loaded. Replace it with your own facts before using it."); }
  return <main className="hub-page prepare-page"><div className="page-heading"><div><p className="eyebrow">TURN EXPERIENCE INTO A CLEAR STORY</p><h1>Walk in a little more prepared.</h1><p>Practise your answers. Shape your application. Keep it true to you.</p></div><button className="secondary-button" type="button" onClick={loadExample}><Icon name="play" size={15}/>Try a fictional example</button></div>
    <div className="tool-tabs" onKeyDown={tabKeys} role="tablist" aria-label="Preparation tools">{([{ id: "interview", label: "Interview practice", icon: "bulb" }, { id: "letter", label: "Cover letter", icon: "file" }, { id: "followup", label: "Follow-up email", icon: "briefcase" }] as const).map(tab => <button key={tab.id} type="button" role="tab" tabIndex={tool === tab.id ? 0 : -1} aria-selected={tool === tab.id} aria-controls={`tool-${tab.id}`} id={`tab-${tab.id}`} onClick={() => { setTool(tab.id); setMessage(""); }}><Icon name={tab.icon} size={17}/>{tab.label}</button>)}</div>
    <div className="target-role-bar"><Icon name="briefcase" size={20}/><div><strong>Your target role</strong><span>{selected ? "From your application board" : "Choose a saved role or enter one below"}</span></div><label><span className="sr-only">Choose a saved role</span><select value={selected} onChange={e => { setSelected(e.target.value); const job = jobs.find(job => job.id === e.target.value); if (job) { setRole(job.title); setCompany(job.company); setExample(previous => previous || job.sample); } setQuestion(0); setMessage(""); }}><option value="">Enter a role manually</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.title} · {job.company}{job.sample ? " (example)" : ""}</option>)}</select></label></div>
    <section role="tabpanel" id={`tool-${tool}`} aria-labelledby={`tab-${tool}`}><div className="prepare-columns"><div className="panel preparation-form"><div className="form-two-col"><label>Role title<input value={role} onChange={e => { setRole(e.target.value); setSelected(""); setQuestion(0); }} maxLength={300}/></label><label>Company<input value={company} onChange={e => { setCompany(e.target.value); setSelected(""); }} maxLength={200} placeholder="Company name"/></label></div>
      {tool === "interview" ? <><div className="question-picker"><p className="eyebrow">PRACTICE QUESTION {question + 1} OF {questions.length}</p><h2>{questions[question]}</h2><div>{questions.map((_, index) => <button type="button" key={index} aria-label={`Practice question ${index + 1}`} aria-pressed={question === index} onClick={() => setQuestion(index)}>{index + 1}</button>)}</div></div><div className="star-form">{STAR.map((part, index) => <label key={part.name}><span className="star-part"><strong>{part.letter}</strong><span>{part.name}<small>{part.hint}</small></span><Icon name={star[index].trim() ? "check" : "edit"} size={16}/></span><textarea aria-label={`${part.name} answer`} value={star[index]} onChange={e => setStar(previous => previous.map((value, position) => position === index ? e.target.value : value))} rows={3} maxLength={2000} placeholder={part.placeholder}/></label>)}</div></> : <><label>Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="The name you want to sign with" maxLength={120}/></label>{tool === "letter" ? <><label>Why this role interests you<textarea value={motivation} onChange={e => setMotivation(e.target.value)} rows={3} maxLength={1500} placeholder="One specific reason, in your own words."/></label><label>A relevant example from your experience<textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={5} maxLength={3000} placeholder="What you did, how you did it, and the outcome you can support."/></label></> : <label>Date you applied<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>}<div className="draft-note"><Icon name="edit" size={18}/><p>This tool arranges the facts you enter into a simple draft. Review the wording and add any details the advert asks for.</p></div></>}
    </div><aside className="draft-preview panel"><div className="panel-heading"><h2>{tool === "interview" ? "Your answer, taking shape" : tool === "letter" ? "Your cover letter" : "Your follow-up draft"}</h2><span className="subtle-badge">{example ? "Fictional example" : "Your words"}</span></div>{tool === "interview" && <><div className="draft-progress"><span>{complete} of 4 parts drafted</span><div>{STAR.map((part, index) => <span key={part.name} className={star[index].trim() ? "complete" : ""}/>)}</div></div><p className="draft-question">{questions[question]}</p></>}{output ? <pre className="draft-text">{output}</pre> : <div className="friendly-empty"><Icon name="edit" size={32}/><strong>Start with what you know.</strong><p>{tool === "interview" ? "Your answer will appear here as you complete each part." : "Fill in the fields to create a draft from your facts."}</p></div>}<div className="draft-actions"><button className="primary-button" disabled={!output} type="button" onClick={copy}>Copy draft <Icon name="check" size={15}/></button><button className="secondary-button" disabled={!output} type="button" onClick={() => downloadText(`careerpilot-${tool}.txt`, `${example ? "FICTIONAL PRACTICE EXAMPLE — replace with your own facts.\n\n" : ""}${tool === "interview" ? questions[question] + "\n\n" : ""}${output}`)}><Icon name="download" size={15}/>Download text</button></div>{message && <p className="inline-status" role="status">{message}</p>}<p className="field-note">Drafts stay in this tab and are not sent to an employer or AI service. Copy or download before leaving.</p></aside></div></section>
    <div className="prep-tips"><div><Icon name="check" size={18}/><span>Use a real example</span></div><div><Icon name="clock" size={18}/><span>Aim for a clear, focused answer</span></div><div><Icon name="shield" size={18}/><span>Keep claims you can support</span></div></div>
  </main>;
}
