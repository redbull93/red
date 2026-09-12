"use client";

import { useEffect, useState } from "react";
import type { DependencyRecord, DependencyStatus } from "@red/shared";

export default function DependenciesPage() {
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  async function loadDependencies() {
    setLoading(true);
    try {
      const res = await fetch("/api/dependencies");
      if (res.ok) {
        const data = await res.json();
        setDependencies(data.dependencies || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDependencies();
  }, []);

  async function updateStatus(id: string, status: DependencyStatus) {
    const res = await fetch("/api/dependencies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      await loadDependencies();
    }
  }

  const filtered = dependencies.filter((dep) => {
    if (filter === "active") return dep.status !== "resolved";
    if (filter === "resolved") return dep.status === "resolved";
    return true;
  });

  const activeCount = dependencies.filter((d) => d.status !== "resolved").length;
  const resolvedCount = dependencies.filter((d) => d.status === "resolved").length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Cross-Referenced Blockers & Dependency Graph
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Implicit & explicit coordination gaps deduced across team standups
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 transition ${
              filter === "all"
                ? "bg-white/10 text-white font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            All ({dependencies.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`rounded-md px-3 py-1.5 transition ${
              filter === "active"
                ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter("resolved")}
            className={`rounded-md px-3 py-1.5 transition ${
              filter === "resolved"
                ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            onClick={loadDependencies}
            className="ml-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-zinc-400 hover:text-white"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center font-mono text-xs text-zinc-500">
            Querying dependency graph from Supabase...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No blockers matching this filter</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              When teammates report dependencies in DMs, the Reasoning Engine maps them here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((dep) => {
              const confidencePercent = Math.round(dep.confidence * 100);

              return (
                <div
                  key={dep.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20"
                >
                  {/* Visual Dependency Flow */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                        {dep.type}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase border ${
                          dep.status === "resolved"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : dep.status === "waiting_hitl"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        }`}
                      >
                        {dep.status}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        Confidence: {confidencePercent}%
                      </span>
                    </div>

                    <div>
                      {dep.status !== "resolved" ? (
                        <button
                          onClick={() => updateStatus(dep.id, "resolved")}
                          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                        >
                          ✓ Mark Resolved
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-zinc-500">
                          Resolved {dep.resolvedAt ? new Date(dep.resolvedAt).toLocaleTimeString() : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Flow visualization */}
                  <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3 rounded-lg border border-white/5 bg-black/40 p-4 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-rose-300 font-bold border border-rose-500/30">
                        @{dep.blockedName || dep.blockedUserId || "Blocked Person"}
                      </span>
                      <span className="text-zinc-500">is waiting for</span>
                    </div>

                    <div className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-1 text-white font-semibold text-center">
                      &ldquo;{dep.subject}&rdquo;
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">from</span>
                      <span className="rounded-full bg-ember/20 px-2.5 py-1 text-ember font-bold border border-ember/30">
                        @{dep.blockerName || dep.blockerUserId || "Responsible Person"}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Pills */}
                  {dep.evidence && dep.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500 uppercase">
                        Evidence:
                      </span>
                      {dep.evidence.map((ev, i) => (
                        <span
                          key={i}
                          className="rounded border border-white/10 bg-white/[0.02] px-2 py-0.5 font-mono text-[11px] text-zinc-400"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-6 font-mono text-[11px] text-zinc-500">
                    <span>Dependency ID: {dep.id}</span>
                    <span>Standup: {dep.standupId}</span>
                    <span>Created: {dep.createdAt ? new Date(dep.createdAt).toLocaleTimeString() : "—"}</span>
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
