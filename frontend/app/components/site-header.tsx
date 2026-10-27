"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rocket } from "./icons";

export default function SiteHeader() {
  const path = usePathname();
  return <header className="marketing-header"><Link className="marketing-brand" href="/" aria-label="CareerPilot AI home"><Rocket size={37} /><span>CareerPilot AI</span></Link><nav aria-label="Main navigation"><Link href="/" aria-current={path === "/" ? "page" : undefined}>Home</Link><Link href="/#features">Features</Link><Link href="/#how-it-works">How it works</Link><Link href="/jobs/" aria-current={path.startsWith("/jobs") ? "page" : undefined}>Find jobs</Link><Link href="/#about">About</Link></nav><div className="header-actions"><Link className="header-secondary" href="/workspace/">My workspace</Link><Link className="header-primary" href="/workspace/">Get started</Link></div></header>;
}
