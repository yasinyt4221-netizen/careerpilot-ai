"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rocket } from "./icons";

export default function SiteHeader() {
  const path = usePathname();
  return <header className="marketing-header"><Link className="marketing-brand" href="/" aria-label="CareerPilot AI home"><Rocket size={37} /><span>CareerPilot AI</span></Link><nav aria-label="Main navigation"><Link href="/" aria-current={path === "/" ? "page" : undefined}>Home</Link><Link href="/#features">Features</Link><Link href="/dashboard/">Workspace</Link><Link href="/jobs/">Find jobs</Link><Link href="/#about">About</Link></nav><div className="header-actions"><Link className="header-secondary" href="/dashboard/">My workspace</Link><Link className="header-primary" href="/dashboard/">Try the demo</Link></div></header>;
}
