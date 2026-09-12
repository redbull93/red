"use client";

import { useEffect, useState } from "react";
import type { DependencyRecord, DependencyStatus } from "@red/shared";

export default function DependenciesPage() {
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Cross-Referenced Blockers & Dependency Graph
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          Implicit & explicit dependencies detected across teammate standups
        </p>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-12 text-center font-mono text-xs text-zinc-500">
            Querying dependency graph from Supabase...
          </div>
        ) : dependencies.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">No blockers detected</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              When teammates report dependencies in DMs, the Reasoning Engine maps them here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-white/10 bg-white/[0.03] text-zinc-400 uppercase text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-5 py-3.5">Blocked Person</th>
                  <th className="px-5 py-3.5">Responsible</th>
                  <th className="px-5 py-3.5">Confidence</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {dependencies.map((dep) => (
                  <tr key={dep.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-5 py-4">
                      <span className="rounded bg-white/10 px-2 py-0.5 font-bold uppercase text-[10px] text-zinc-300">
                        {dep.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white max-w-xs truncate">
                      {dep.subject}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      @{dep.blockedName || dep.blockedUserId || "unknown"}
                    </td>
                    <td className="px-5 py-4 text-ember">
                      @{dep.blockerName || dep.blockerUserId || "unassigned"}
                    </td>
                    <td className="px-5 py-4 text-zinc-400">
                      {Math.round(dep.confidence * 100)}%
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                          dep.status === "resolved"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : dep.status === "waiting_hitl"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        }`}
                      >
                        {dep.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {dep.status !== "resolved" ? (
                        <button
                          onClick={() => updateStatus(dep.id, "resolved")}
                          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                        >
                          Mark Resolved
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-500">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
