"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Icon, Rocket } from "./icons";
import { useApplications } from "../application-store";
import { DEMO_MODE, publicAsset } from "../api-config";

const navigation = [
  { href: "/dashboard/", label: "Overview", icon: "grid" },
  { href: "/workspace/", label: "CV review", icon: "file" },
  { href: "/jobs/", label: "Find jobs", icon: "search" },
  { href: "/applications/", label: "Applications", icon: "briefcase" },
  { href: "/prepare/", label: "Prepare", icon: "bulb" },
];
const guide = [
  { title: "Meet your workspace", text: "A clear place to improve your CV, discover roles and keep your next step in view.", href: "/dashboard/", action: "Open overview", icon: "grid" },
  { title: "See the change", text: "Try a sample CV. Select a highlight, compare the wording, apply a correction and undo it.", href: "/workspace/?sample=1", action: "Try a CV review", icon: "edit" },
  { title: "Find and save a role", text: "Search public job feeds. Check the original advert and sponsorship evidence, then save a role to your board.", href: "/jobs/", action: "Find a job", icon: "search" },
  { title: "Keep moving forward", text: "Move jobs through your application stages, add a next date and practise an interview answer with your own examples.", href: "/applications/", action: "Open applications", icon: "briefcase" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const jobs = useApplications();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [shareMessage, setShareMessage] = useState("");
  async function share() { try { await navigator.clipboard.writeText(new URL(publicAsset("dashboard/"), window.location.origin).href); setShareMessage("Workspace link copied. Your saved roles are not included."); } catch { setShareMessage("Copy the workspace URL from your browser to share the demo."); } }
  if (pathname === "/") return <><a className="skip-link" href="#main-content">Skip to content</a>{children}</>;
  const current = navigation.find(item => pathname.startsWith(item.href.slice(0, -1)));
  const item = guide[step];
  return <div className="app-shell"><a className="skip-link" href="#app-content">Skip to content</a>
    <aside className="app-sidebar"><Link className="app-brand" href="/" aria-label="CareerPilot AI home"><Rocket size={30}/><span>CareerPilot<span>AI</span></span></Link><span className="sidebar-caption">YOUR CAREER WORKSPACE</span>
      <nav aria-label="Workspace navigation">{navigation.map(link => <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href.slice(0, -1)) ? "page" : undefined}><Icon name={link.icon} size={19}/><span>{link.label}</span>{link.label === "Applications" && jobs.length > 0 && <small>{jobs.length}</small>}</Link>)}</nav>
      <div className="sidebar-guide"><span className="guide-icon"><Icon name="spark" size={21}/></span><strong>A little clarity goes a long way.</strong><p>Take a quick tour, then make it yours.</p><button type="button" onClick={() => { setStep(0); dialog.current?.showModal(); }}>Show me around <Icon name="arrow" size={15}/></button></div>
      <div className="sidebar-bottom"><span className="profile-avatar">CP</span><div><strong>Your workspace</strong><small>Stored on this browser</small></div><Link href="/help/" aria-label="Help and browser data"><Icon name="help" size={20}/></Link></div>
    </aside>
    <div className="app-main"><header className="app-topbar"><div><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{current?.label ?? "Help & privacy"}</strong></div><div className="topbar-actions"><span className="preview-tag"><span/>{DEMO_MODE ? "Showcase demo" : "Local workspace"}</span><button type="button" className="icon-button" aria-label="Open quick tour" onClick={() => { setStep(0); dialog.current?.showModal(); }}><Icon name="help"/></button><button className="share-demo-button" aria-label="Share demo" type="button" onClick={share}><Icon name="external" size={14}/><span>Share demo</span></button></div></header>
      {shareMessage && <div className="share-notice" role="status">{shareMessage}<button className="icon-button" type="button" aria-label="Dismiss share message" onClick={() => setShareMessage("")}><Icon name="close" size={14}/></button></div>}
      <div id="app-content" className="app-page-content">{children}</div><footer className="app-footer"><span>Built around your next opportunity.</span><Link href="/help/">Help & browser data</Link></footer>
    </div>
    <nav className="app-mobile-nav" aria-label="Mobile workspace navigation">{navigation.map(link => <Link key={link.href} href={link.href} aria-current={pathname.startsWith(link.href.slice(0, -1)) ? "page" : undefined}><Icon name={link.icon} size={20}/><span>{link.label}</span></Link>)}</nav>
    <dialog className="tour-dialog" ref={dialog}><button type="button" className="dialog-close icon-button" aria-label="Close tour" onClick={() => dialog.current?.close()}><Icon name="close"/></button><span className="tour-illustration"><Icon name={item.icon} size={42}/></span><p className="eyebrow">A QUICK LOOK · {step + 1} OF {guide.length}</p><h2>{item.title}</h2><p>{item.text}</p><div className="tour-dots" aria-label={`Step ${step + 1} of ${guide.length}`}>{guide.map((_, index) => <span className={index === step ? "active" : ""} key={index}/>)}</div><div className="tour-actions"><Link href={item.href} onClick={() => dialog.current?.close()}>{item.action}</Link><button type="button" className="small-primary" onClick={() => step === guide.length - 1 ? dialog.current?.close() : setStep(step + 1)}>{step === guide.length - 1 ? "Let’s go" : "Next"}<Icon name="arrow" size={15}/></button></div></dialog>
  </div>;
}
