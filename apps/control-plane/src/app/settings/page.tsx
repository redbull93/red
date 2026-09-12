"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [health, setHealth] = useState<{
    status: string;
    supabase: string;
    project: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => null);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Environment & Integration Settings
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          Status of Supabase, Slack, Discord, GitHub, OpenAI, and Trigger.dev
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Supabase Status */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white">Supabase (Superbase)</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase font-bold border ${
                health?.supabase === "connected"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}
            >
              {health?.supabase === "connected" ? "Connected" : "In-Memory Fallback"}
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Stores persistent workspaces, users, standups, cross-referenced dependencies, and audit events.
          </p>
          <div className="mt-4 rounded-lg bg-black/40 p-3 font-mono text-[11px] text-zinc-400">
            <div>SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "not set (using fallback)"}</div>
            <div className="mt-1">SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "configured" : "not set"}</div>
          </div>
        </div>

        {/* Slack Adapter */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white">Slack Adapter</h3>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-zinc-300">
              Socket Mode
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Interacts with teammates via private DMs, cross-references replies, and delivers receipts to #standup.
          </p>
          <div className="mt-4 rounded-lg bg-black/40 p-3 font-mono text-[11px] text-zinc-400">
            <div>Commands: /standup</div>
            <div className="mt-1">Interactivity: Approve / Stop Block Kit buttons</div>
          </div>
        </div>

        {/* Discord Adapter */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white">Discord Adapter</h3>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-zinc-300">
              Gateway v10
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Listens to user DMs and guild messages, provides slash command /standup, and posts channel embeds.
          </p>
          <div className="mt-4 rounded-lg bg-black/40 p-3 font-mono text-[11px] text-zinc-400">
            <div>Commands: /standup</div>
            <div className="mt-1">Components: Interactive Action Buttons</div>
          </div>
        </div>

        {/* GitHub Reality Checker */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-white">GitHub Integration</h3>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/30">
              Active
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Reconciles claimed blockers against GitHub PRs and CI checks (e.g. auto-detects if PR #42 is merged).
          </p>
          <div className="mt-4 rounded-lg bg-black/40 p-3 font-mono text-[11px] text-zinc-400">
            <div>Target: redbull93/red</div>
            <div className="mt-1">Capability: Auto-resolve blockers when PR merges</div>
          </div>
        </div>
      </div>
    </div>
  );
}
