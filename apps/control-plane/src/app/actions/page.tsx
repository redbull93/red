"use client";

import { useEffect, useState } from "react";
import type { PendingActionRecord } from "@red/shared";

export default function ActionsPage() {
  const [actions, setActions] = useState<PendingActionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadActions() {
    setLoading(true);
    try {
      const res = await fetch("/api/actions");
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActions();
  }, []);

  async function decide(actionId: string, decision: "approved" | "rejected") {
    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, decision }),
    });
    if (res.ok) {
      await loadActions();
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Human-In-The-Loop (HITL) Action Queue
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          Supervised autonomous interventions pending human approval
        </p>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-12 text-center font-mono text-xs text-zinc-500">
            Checking HITL queue in Supabase...
          </div>
        ) : actions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="font-display text-lg text-zinc-300">HITL queue is empty</p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Actions requiring approval (such as unblocking notifications or pings) will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {actions.map((act) => (
              <div
                key={act.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                        {act.type}
                      </span>
                      <span className="font-mono text-xs text-zinc-400">
                        Target: {act.targetUserId ? `@${act.targetUserId}` : "Channel"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase font-bold border ${
                          act.status === "executed"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : act.status === "rejected"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {act.status}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-zinc-200 font-medium">
                      {act.message}
                    </p>

                    <div className="mt-3 flex items-center gap-4 font-mono text-[11px] text-zinc-500">
                      <span>Action ID: {act.id}</span>
                      <span>Workspace: {act.workspaceId}</span>
                      {act.createdAt && (
                        <span>Created: {new Date(act.createdAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>

                  {act.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(act.id, "approved")}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 font-mono text-xs font-semibold text-white shadow hover:bg-emerald-500 transition-colors"
                      >
                        Approve & Execute
                      </button>
                      <button
                        onClick={() => decide(act.id, "rejected")}
                        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:bg-rose-500/20 hover:border-rose-500/30 hover:text-rose-300 transition-colors"
                      >
                        Stop / Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
