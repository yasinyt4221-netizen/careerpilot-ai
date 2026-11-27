import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./landing.css";
import "./jobs.css";
import "./showcase.css";
import AppShell from "./components/app-shell";
import { CVSessionProvider } from "./cv-session";
import "./evidence.css";
import HostedAccess from "./components/hosted-access";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "HireReady | Your next move, clearer",
  description: "Visual CV review, public job discovery, application tracking and interview practice in one clear career workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={inter.variable}><body><CVSessionProvider><HostedAccess><AppShell>{children}</AppShell></HostedAccess></CVSessionProvider></body></html>;
}
