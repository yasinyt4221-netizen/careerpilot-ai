"use client";

import { useState } from "react";
import { Icon, Rocket } from "./icons";

export default function LandingPreview() {
  const [tab, setTab] = useState("Skills");
  return <div className="landing-preview" aria-label="Illustrative CV analysis preview">
    <aside className="preview-navigation"><div className="preview-brand"><Rocket size={21} />CareerPilot AI</div><div className="preview-nav-active"><Icon name="grid" size={14} />Dashboard</div><div><Icon name="chart" size={14} />Analyse job match</div><div><Icon name="file" size={14} />My CV</div><div><Icon name="briefcase" size={14} />Find jobs</div><div className="preview-user"><span>JD</span><p>Example applicant<small>Illustrative preview</small></p></div></aside>
    <div className="preview-body"><div className="preview-title"><div><h2>Job Match Analysis</h2><p>A clearer view of your next application.</p></div><span>Example preview</span></div>
      <div className="preview-cards"><div className="preview-score-card"><h3>CV match score</h3><div><svg className="score-circle" viewBox="0 0 104 104" aria-hidden="true"><circle className="score-track" cx="52" cy="52" r="43"/><circle className="score-fill" cx="52" cy="52" r="43" strokeDasharray="211 271"/><text x="52" y="59" textAnchor="middle">78</text></svg><p><strong>See where you fit</strong><span>Find your strengths and the details worth improving.</span></p></div></div><div className="preview-job-card"><h3>Job details</h3><strong>Data Analyst</strong><p>Example Company</p><span><Icon name="location" size={12} />London, UK</span><span><Icon name="shield" size={12} />Check sponsorship</span></div></div>
      <div className="preview-tabs" role="tablist" aria-label="Example analysis views">{["Skills", "Visual edits", "Job matches"].map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div>
      <div className="preview-tab-content" role="tabpanel" aria-label={tab}>{tab === "Skills" ? ["Python", "Data analysis", "SQL", "Data visualisation"].map((skill, index) => <div className="preview-skill" key={skill}><span className={index === 2 ? "amber" : "green"}><Icon name={index === 2 ? "bulb" : "check"} size={12} /></span><p><strong>{skill}</strong><small>{index === 2 ? "Add a work example" : "Found in this example CV"}</small></p><em className={index === 2 ? "amber" : "green"}>{index === 2 ? "Make it clearer" : "Covered"}</em></div>) : tab === "Visual edits" ? <div className="preview-diff"><span>BEFORE</span><p><mark>Built a reporting dashboard.</mark></p><span>MAKE IT SPECIFIC</span><p>Built [actual dashboard] for [actual users] to [real purpose].</p><small>You supply the facts. Your experience stays truthful.</small></div> : <div className="preview-job-example"><Icon name="briefcase" size={29} /><strong>Find a role worth applying for</strong><p>Compare skills and check the advert’s sponsorship wording.</p><small>Sources and visa checks are shown with each role.</small></div>}</div>
    </div>
  </div>;
}
