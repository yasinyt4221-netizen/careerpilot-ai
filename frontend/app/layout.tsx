import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";
import "./jobs.css";

export const metadata: Metadata = {
  title: "CareerPilot AI | CV workspace",
  description: "Extract and review the text in your CV with CareerPilot AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
