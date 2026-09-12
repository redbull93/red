"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { denizenFor } from "@/lib/dungeon";

/**
 * The Dungeon — three cells and a yes/no.
 *
 * Who spoke, what they found, and whether you have to decide. Everything else
 * (reasons, receipts, model ids, traces) lives in mission control.
 */

type Opinion = {
  seat: string;
  status: "answered" | "abstained";
  dependencies: Array<{ waiter: string; blocker: string }>;
};

type Verdict = {
  seated: string[];
  consensus: unknown[];
  unverified: boolean;
  demo?: boolean;
  opinions: Opinion[];
};

type Approval = {
  id: string;
  runId: string;
  preview: string;
  status: string;
};

type Run = { id: string; verdict?: Verdict };

type Snapshot = {
  runs: Run[];
  approvals: Approval[];
};

function cap(name: string): string {
  return name ? name[0].toUpperCase() + name.slice(1) : name;
}

export function Dungeon() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      setSnapshot((await res.json()) as Snapshot);
    } catch {
      setError("Can't reach the control plane.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [load]);

  // A run waiting on you wins. Otherwise the newest verdict.
  const run = useMemo(() => {
    const runs = snapshot?.runs ?? [];
    const waiting = new Set(
      (snapshot?.approvals ?? []).filter((a) => a.status === "pending").map((a) => a.runId),
    );
    return runs.find((r) => waiting.has(r.id)) ?? runs.find((r) => r.verdict) ?? runs[0];
  }, [snapshot]);

  const verdict = run?.verdict;
  const pending = snapshot?.approvals.find(
    (a) => a.status === "pending" && a.runId === run?.id,
  );

  const act = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That didn't work.");
      }
      await load();
    } catch {
      setError("That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const cells = useMemo(() => {
    if (!verdict) return [];
    const bySeat = new Map(verdict.opinions.map((o) => [o.seat, o]));
    return ["gpt", "opus", "deepseek"].map((seat) => ({
      seat,
      name: denizenFor(seat).alias,
      opinion: bySeat.get(seat),
    }));
  }, [verdict]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold text-white">The Dungeon</h1>
        <button
          onClick={() => void act("/api/kick-standup")}
          disabled={busy}
          className="rounded-md bg-ember px-3 py-2 font-mono text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Run"}
        </button>
      </div>

      {error && <p className="mb-6 text-sm text-red-300">{error}</p>}

      {!verdict && (
        <p className="text-sm text-zinc-500">Nothing here yet. Hit Run.</p>
      )}

      {verdict && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {cells.map(({ seat, name, opinion }) => {
              const spoke = opinion?.status === "answered";
              const found = opinion?.dependencies[0];
              return (
                <div
                  key={seat}
                  className={`rounded-xl border bg-ash/70 p-4 ${
                    spoke ? "border-white/15" : "border-white/5 opacity-50"
                  }`}
                >
                  <p className="font-display text-sm font-bold text-white">{name}</p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {!opinion
                      ? "—"
                      : spoke
                        ? found
                          ? `${cap(found.waiter)} → ${cap(found.blocker)}`
                          : "Clear"
                        : "Asleep"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            {pending ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-5">
                <p className="text-sm text-zinc-200">
                  {pending.preview || "They disagreed. Send it anyway?"}
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => void act("/api/approve", { approvalId: pending.id })}
                    disabled={busy}
                    className="rounded-md bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-black disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => void act("/api/stop", { approvalId: pending.id })}
                    disabled={busy}
                    className="rounded-md border border-white/15 px-4 py-2 font-mono text-xs text-zinc-300 disabled:opacity-50"
                  >
                    Hold
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                {verdict.consensus.length
                  ? "Agreed. Sent."
                  : verdict.unverified
                    ? "Only one woke up. Sent anyway."
                    : "Nothing to send."}
              </p>
            )}
          </div>

          {verdict.demo && (
            <p className="mt-8 font-mono text-[10px] text-zinc-600">demo</p>
          )}
        </>
      )}
    </div>
  );
}
