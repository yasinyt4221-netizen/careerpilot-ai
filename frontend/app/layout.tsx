import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";
import "./jobs.css";
import "./showcase.css";
import AppShell from "./components/app-shell";
import { CVSessionProvider } from "./cv-session";
import "./evidence.css";
import HostedAccess from "./components/hosted-access";

export const metadata: Metadata = {
  title: "CareerPilot AI | Your next move, clearer",
  description: "Visual CV review, public job discovery, application tracking and interview practice in one clear career workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><CVSessionProvider><HostedAccess><AppShell>{children}</AppShell></HostedAccess></CVSessionProvider></body></html>;
}
