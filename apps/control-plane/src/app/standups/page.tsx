"use client";

import { useEffect, useState } from "react";
import type { Standup, StandupResponse } from "@red/shared";

type StandupWithResponses = Standup & {
  responses?: StandupResponse[];
};

export default function StandupsPage() {
  const [standups, setStandups] = useState<StandupWithResponses[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Daily Standup Sessions
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Automated morning rituals and teammate updates stored in Supabase
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadStandups}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-zinc-300 hover:bg-white/10 transition"
          >
            ↻ Refresh
          </button>
          <button
            onClick={triggerStandup}
            disabled={triggering}
            className="flex items-center gap-2 rounded-md bg-ember px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-ember/20 transition-all hover:bg-ember/90 disabled:opacity-50"
          >
            {triggering ? "Starting Standup..." : "⚡ Trigger Standup Now"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center font-mono text-xs text-zinc-500">
            Querying standup sessions and teammate responses from Supabase...
          </div>
        ) : standups.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No standup sessions recorded yet</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Click &ldquo;Trigger Standup Now&rdquo; or run <code className="text-ember">npm run loop:agent</code>.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {standups.map((s) => {
              const isExpanded = expandedId === s.id;
              const responsesCount = s.responses?.length ?? 0;

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-white">
                        {s.date}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase font-bold border ${
                          s.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                        {responsesCount} check-in{responsesCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-zinc-500">
                        ID: {s.id}
                      </span>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className="rounded border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:bg-white/10 transition"
                      >
                        {isExpanded ? "Hide Updates ▲" : "View Updates ▼"}
                      </button>
                    </div>
                  </div>

                  {s.summary && (
                    <div className="mt-3 rounded-lg border border-white/5 bg-black/40 p-3.5">
                      <p className="font-mono text-[11px] text-fuchsia-300/80 uppercase tracking-wider mb-1 font-semibold">
                        Cross-Referenced Summary:
                      </p>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                        {s.summary}
                      </p>
                    </div>
                  )}

                  {/* Expanded Teammate Responses Detail */}
                  {isExpanded && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <h4 className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 mb-3">
                        Teammate Check-ins ({responsesCount})
                      </h4>

                      {responsesCount === 0 ? (
                        <p className="font-mono text-xs text-zinc-500">
                          No teammate DMs collected for this standup yet.
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {s.responses?.map((r) => (
                            <div
                              key={r.id || r.userId}
                              className="rounded-lg border border-white/5 bg-white/[0.01] p-3 font-mono text-xs"
                            >
                              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
                                <span className="font-bold text-white">
                                  @{r.userName || r.userId}
                                </span>
                                <span className="text-zinc-500">
                                  Platform: {r.platform} · {new Date(r.createdAt).toLocaleTimeString()}
                                </span>
                              </div>

                              <div className="grid gap-1.5 text-[11px]">
                                {r.finished && (
                                  <div className="text-emerald-300">
                                    <span className="text-zinc-500">Finished: </span>
                                    {r.finished}
                                  </div>
                                )}
                                {r.workingOn && (
                                  <div className="text-sky-300">
                                    <span className="text-zinc-500">Working On: </span>
                                    {r.workingOn}
                                  </div>
                                )}
                                {r.blockedBy ? (
                                  <div className="text-rose-400 font-semibold">
                                    <span className="text-zinc-500">Blocked By: </span>
                                    {r.blockedBy}
                                  </div>
                                ) : (
                                  <div className="text-zinc-500">
                                    <span>Blocked By: </span>None
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-6 font-mono text-[11px] text-zinc-500 border-t border-white/5 pt-3">
                    <span>Started: {s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "—"}</span>
                    {s.completedAt && (
                      <span>Completed: {new Date(s.completedAt).toLocaleTimeString()}</span>
                    )}
                    <span>Workspace: {s.workspaceId}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
