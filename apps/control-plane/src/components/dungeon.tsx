"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { denizenFor, dungeonReason } from "@/lib/dungeon";

/**
 * The Dungeon — the agent portal.
 *
 * Three models are held in three cells. Each reads the same stand-up alone. Where
 * they agree the agent acts; where they don't, it stops and asks you.
 *
 * That sentence is the whole page, so the page shows only what supports it: who
 * spoke, whether they agreed, what you have to decide, and what actually landed.
 * Confidence scores, latencies, token counts, per-claim vote tallies and the full
 * trace log all previously lived here, which meant the one thing a person needed
 * to see — that the agent is waiting on them — competed with six panels of
 * telemetry. Telemetry belongs in mission control; this room is for the decision.
 *
 * Cells are always rendered, even for a model that never answered. An empty cell
 * saying "out of mana" is information; hiding it would quietly imply the council
 * was unanimous when only one model actually spoke.
 */

type Claim = { key: string; text: string; agreedBy: string[] };

type Opinion = {
  seat: string;
  model: string;
  status: "answered" | "abstained";
  abstainReason?: string;
  dependencies: Array<{ waiter: string; blocker: string; artifact: string }>;
  suggestedAction: string;
};

type Verdict = {
  at: string;
  seated: string[];
  consensus: Claim[];
  dissent: Claim[];
  unverified: boolean;
  cached: boolean;
  demo?: boolean;
  opinions: Opinion[];
};

type Approval = {
  id: string;
  runId: string;
  reason: string;
  preview: string;
  status: string;
};

type Run = { id: string; status: string; verdict?: Verdict };

type Snapshot = {
  runs: Run[];
  approvals: Approval[];
  receipts: Array<{
    id: string;
    runId: string;
    body: string;
    channelId: string;
    at: string;
  }>;
};

export function Dungeon() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      setSnapshot((await res.json()) as Snapshot);
    } catch {
      setError("The Dungeon is unreachable. Is the control plane running?");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [load]);

  // store.snapshot() already returns newest-first, so this must not re-reverse.
  // A run actually waiting on a human wins over a newer finished one: otherwise
  // the page sits on a completed expedition while the approval someone came here
  // to resolve is invisible.
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
  // The receipt for the run on screen, not merely the newest one — pairing this
  // run's cells with some other run's receipt would be actively misleading.
  const receipt = snapshot?.receipts.find((r) => r.runId === run?.id);

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
        setError(data.error ?? `${path} failed (${res.status})`);
      }
      await load();
    } catch {
      setError(`${path} could not be reached`);
    } finally {
      setBusy(false);
    }
  };

  const cells = useMemo(() => {
    if (!verdict) return [];
    const bySeat = new Map(verdict.opinions.map((o) => [o.seat, o]));
    const order = ["gpt", "opus", "deepseek"];
    const extras = verdict.opinions.map((o) => o.seat).filter((s) => !order.includes(s));
    return [...order, ...extras].map((seat) => ({
      seat,
      denizen: denizenFor(seat),
      opinion: bySeat.get(seat),
    }));
  }, [verdict]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
            The Dungeon
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Three models read the stand-up separately. When they agree, the agent
            acts. When they don&rsquo;t, it asks you.
          </p>
        </div>
        <button
          onClick={() => void act("/api/kick-standup")}
          disabled={busy}
          className="rounded-md bg-ember px-4 py-2 font-mono text-xs font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Run a stand-up"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      {!verdict && (
        <div className="rounded-xl border border-white/10 bg-ash/60 p-10 text-center">
          <p className="font-display text-xl text-zinc-300">The cells are empty.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Nothing has run yet. Hit <span className="text-ember">Run a stand-up</span>,
            or seed the board with{" "}
            <code className="font-mono text-ember">npm run seed:demo</code>.
          </p>
        </div>
      )}

      {verdict && (
        <>
          {/* The cells: who is awake, and the one thing each of them said. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {cells.map(({ seat, denizen, opinion }) => {
              const spoke = opinion?.status === "answered";
              const finding = opinion?.dependencies[0];
              return (
                <motion.div
                  key={seat}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`rounded-xl border bg-ash/70 p-4 ${
                    spoke ? "border-white/15" : "border-white/5 opacity-60"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-sm font-bold leading-tight text-white">
                      {denizen.sigil} {denizen.alias}
                    </h3>
                    <span
                      className={`shrink-0 font-mono text-[10px] ${
                        spoke ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {spoke ? "awake" : "asleep"}
                    </span>
                  </div>

                  {/* The real model id stays visible. The funny name is for the
                      room; this is what you need when something breaks. */}
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">
                    {opinion?.model ?? seat}
                  </p>

                  <p className="mt-3 text-xs leading-relaxed text-zinc-300">
                    {!opinion
                      ? "Never summoned."
                      : spoke
                        ? finding
                          ? `${finding.waiter} waits on ${finding.blocker}`
                          : "Found no blockers."
                        : dungeonReason(opinion.abstainReason ?? "")}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* The verdict, in one line. This is the page. */}
          <div className="mt-6">
            {pending ? (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-5"
                >
                  <h2 className="font-display text-lg font-bold text-white">
                    🗝 Your call
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
                    {pending.reason}
                  </p>

                  {pending.preview && (
                    <p className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-zinc-200">
                      {pending.preview}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => void act("/api/approve", { approvalId: pending.id })}
                      disabled={busy}
                      className="rounded-md bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Send it
                    </button>
                    <button
                      onClick={() => void act("/api/stop", { approvalId: pending.id })}
                      disabled={busy}
                      className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 font-mono text-xs font-bold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                    >
                      Don&rsquo;t
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div
                className={`rounded-xl border p-4 text-sm ${
                  verdict.consensus.length
                    ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-200"
                    : "border-white/10 bg-ash/60 text-zinc-400"
                }`}
              >
                {verdict.consensus.length
                  ? `All ${verdict.seated.length} models that spoke agreed. The agent acted without asking.`
                  : "Nothing was agreed unanimously, and nothing needs you."}
                {verdict.unverified && (
                  <span className="ml-1 text-amber-300">
                    Only {verdict.seated.length} of {verdict.opinions.length} answered, so
                    this was never cross-checked.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* What actually landed. No receipt means nothing happened. */}
          {receipt && (
            <div className="mt-6 rounded-xl border border-white/10 bg-ash/60 p-4">
              <p className="mb-2 font-mono text-[10px] uppercase text-zinc-500">
                posted to {receipt.channelId}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                {receipt.body}
              </p>
            </div>
          )}

          {/* Small, and last, but never omitted: a hand-written verdict looks
              exactly like a real one on screen. */}
          <p className="mt-6 font-mono text-[10px] text-zinc-600">
            {new Date(verdict.at).toLocaleTimeString()}
            {verdict.cached && " · replayed from the archive, not live"}
            {verdict.demo && " · seeded demo data, no model was asked"}
          </p>
        </>
      )}
    </div>
  );
}
