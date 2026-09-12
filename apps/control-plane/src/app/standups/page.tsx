"use client";

import { useEffect, useState } from "react";
import type { Standup } from "@red/shared";

export default function StandupsPage() {
  const [standups, setStandups] = useState<Standup[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  async function loadStandups() {
    setLoading(true);
    try {
      const res = await fetch("/api/standups");
      if (res.ok) {
        const data = await res.json();
        setStandups(data.standups || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStandups();
  }, []);

  async function triggerStandup() {
    setTriggering(true);
    try {
      const res = await fetch("/api/kick-standup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadStandups();
      }
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Daily Standup Sessions
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Automated morning rituals across Slack and Discord
          </p>
        </div>
        <button
          onClick={triggerStandup}
          disabled={triggering}
          className="flex items-center gap-2 rounded-md bg-ember px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-ember/20 transition-all hover:bg-ember/90 disabled:opacity-50"
        >
          {triggering ? "Starting Standup..." : "⚡ Trigger Standup Now"}
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-12 text-center font-mono text-xs text-zinc-500">
            Loading standup sessions from Supabase...
          </div>
        ) : standups.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No standup sessions recorded yet</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Click &ldquo;Trigger Standup Now&rdquo; or wait for the morning cron schedule.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {standups.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-white">
                      {s.date}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase font-bold ${
                        s.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">
                    ID: {s.id}
                  </span>
                </div>

                {s.summary && (
                  <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {s.summary}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-6 font-mono text-[11px] text-zinc-400">
                  <span>Started: {s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "—"}</span>
                  {s.completedAt && (
                    <span>Completed: {new Date(s.completedAt).toLocaleTimeString()}</span>
                  )}
                  <span>Workspace: {s.workspaceId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
