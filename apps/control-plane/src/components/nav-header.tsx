"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Mission Control" },
  { href: "/standups", label: "Standups" },
  { href: "/dependencies", label: "Blockers & Graph" },
  { href: "/actions", label: "HITL Approvals" },
  { href: "/users", label: "Teammates" },
  { href: "/settings", label: "Settings" },
];

export function NavHeader() {
  const pathname = usePathname();
  const [supabaseConnected, setSupabaseConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setSupabaseConnected(data.supabase === "connected");
      })
      .catch(() => setSupabaseConnected(false));
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember font-mono font-bold text-white shadow-lg shadow-ember/30">
              S
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white">
              StandUp
            </span>
            <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              AGENT v0.1
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
                    active
                      ? "bg-white/10 text-white shadow-inner font-semibold"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-mono text-zinc-300">
            <span
              className={`h-2 w-2 rounded-full ${
                supabaseConnected === null
                  ? "bg-amber-400 animate-pulse"
                  : supabaseConnected
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                    : "bg-amber-400/80"
              }`}
            />
            <span>
              {supabaseConnected === null
                ? "Connecting..."
                : supabaseConnected
                  ? "Supabase Connected"
                  : "Database: Memory Fallback"}
            </span>
          </div>

          <a
            href="https://github.com/redbull93/red"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
