import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { NavHeader } from "@/components/nav-header";
import { CopilotProvider } from "@/components/copilot-provider";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "StandUp — mission control",
  description:
    "Vengeance UI control plane for StandUp with CopilotKit AI assistant. The agent lives in Slack/Discord, not here.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geist.variable} ${mono.variable} ${display.variable} min-h-screen bg-ink font-sans antialiased text-zinc-100 flex flex-col`}
      >
        <NavHeader />
        <CopilotProvider>
          <main className="flex-1">{children}</main>
        </CopilotProvider>
      </body>
    </html>
  );
}
