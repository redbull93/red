"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  confidenceRank,
  denizenFor,
  dungeonReason,
  LEXICON,
} from "@/lib/dungeon";

/**
 * The Dungeon — the agent portal.
 *
 * Three models are held in three cells. Each one reads the same stand-up alone,
 * and the room shows you what they each said, where they agreed, and where they
 * did not. Disagreement is the interesting part, so it gets the loudest panel:
 * anything contested is waiting on the Warden rather than being averaged into a
 * confident-sounding summary.
 *
 * Cells are always rendered, even for models that never answered. An empty cell
 * that says "out of mana" is information; hiding it would quietly imply the
 * council was unanimous when only one model actually spoke.
 */

type Dependency = { waiter: string; blocker: string; artifact: string };

type Claim = {
  key: string;
  dependency: Dependency;
  text: string;
  agreedBy: string[];
};

type Opinion = {
  seat: string;
  label: string;
  model: string;
  status: "answered" | "abstained";
  abstainReason?: string;
  blockers: string[];
  dependencies: Dependency[];
  suggestedAction: string;
  confidence: number;
  reasoning?: string;
  latencyMs: number;
  totalTokens?: number;
};

type Verdict = {
  at: string;
  seated: string[];
  abstained: Array<{ seat: string; label: string; reason: string }>;
  consensus: Claim[];
  dissent: Claim[];
  suggestedAction: string;
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
  risk: string;
  dissent?: Claim[];
  opinions?: Opinion[];
};

type Run = {
  id: string;
  status: string;
  startedAt: string;
  assistantText?: string;
  verdict?: Verdict;
};

type Trace = {
  id: string;
  runId: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
};

type Snapshot = {
  runs: Run[];
  traces: Trace[];
  approvals: Approval[];
  receipts: Array<{ id: string; body: string; channelId: string; at: string }>;
};

const ACCENTS: Record<string, { border: string; text: string; glow: string; dot: string }> = {
  emerald: {
    border: "border-emerald-400/40",
    text: "text-emerald-300",
    glow: "shadow-[0_0_30px_-10px_rgba(52,211,153,0.5)]",
    dot: "bg-emerald-400",
  },
  violet: {
    border: "border-violet-400/40",
    text: "text-violet-300",
    glow: "shadow-[0_0_30px_-10px_rgba(167,139,250,0.5)]",
    dot: "bg-violet-400",
  },
  amber: {
    border: "border-amber-400/40",
    text: "text-amber-300",
    glow: "shadow-[0_0_30px_-10px_rgba(251,191,36,0.5)]",
    dot: "bg-amber-400",
  },
  zinc: {
    border: "border-white/15",
    text: "text-zinc-300",
    glow: "",
    dot: "bg-zinc-400",
  },
};

export function Dungeon() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  // The newest expedition that actually convened a tribunal. Falling back to the
  // newest run at all means the room is never blank after a council-less run.
  //
  // store.snapshot() already returns newest-first, so this must not re-reverse —
  // doing so silently pinned the room to the oldest run on the board.
  const run = useMemo(() => {
    const runs = snapshot?.runs ?? [];
    return runs.find((r) => r.verdict) ?? runs[0];
  }, [snapshot]);

  const verdict = run?.verdict;
  const pending = snapshot?.approvals.find(
    (a) => a.status === "pending" && a.runId === run?.id,
  );

  const summon = async (path: string, body?: Record<string, unknown>) => {
    setBusy(path);
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
      setBusy(null);
    }
  };

  // Every configured seat gets a cell, whether or not it spoke.
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
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* ── Gate ── */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
            The Dungeon
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Three models are held in three cells. Each reads the stand-up alone.
            Where they all agree, the agent acts. Where they don&rsquo;t, it wakes{" "}
            {LEXICON.human}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void summon("/api/kick-standup")}
            disabled={busy !== null}
            className="rounded-md bg-ember px-4 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-ember/20 transition hover:bg-ember/90 disabled:opacity-50"
          >
            {busy === "/api/kick-standup" ? "Convening…" : "Convene the Tribunal"}
          </button>
          <span className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-500">
            polls every 2.5s
          </span>
        </div>
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
            No tribunal has convened yet. Run{" "}
            <code className="font-mono text-ember">npm run loop</code> in a
            terminal, or hit Convene above.
          </p>
        </div>
      )}

      {verdict && (
        <>
          {/* ── Standing of the tribunal ── */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-ash/60 px-5 py-3">
            <span className="font-display text-sm font-bold text-white">
              {LEXICON.council}
            </span>
            <Pill tone="neutral">{verdict.seated.length} spoke</Pill>
            <Pill tone="good">{verdict.consensus.length} sworn</Pill>
            <Pill tone={verdict.dissent.length ? "bad" : "neutral"}>
              {verdict.dissent.length} contested
            </Pill>
            <Pill tone="neutral">{verdict.abstained.length} asleep</Pill>
            {verdict.unverified && (
              <Pill tone="warn">
                uncorroborated — fewer than two spoke
              </Pill>
            )}
            {verdict.cached && (
              <Pill tone="warn">replayed from the archive, not live</Pill>
            )}
            {/* A seeded verdict is indistinguishable from a real one on screen, so
                it has to say so. Nobody should have to check a run id to know
                whether three models really said this. */}
            {verdict.demo && (
              <Pill tone="warn">seeded demo data — no model was asked</Pill>
            )}
            <span className="ml-auto font-mono text-[10px] text-zinc-500">
              {new Date(verdict.at).toLocaleTimeString()}
            </span>
          </div>

          {/* ── The cells ── */}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            {cells.map(({ seat, denizen, opinion }) => {
              const accent = ACCENTS[denizen.accent] ?? ACCENTS.zinc;
              const spoke = opinion?.status === "answered";
              return (
                <motion.div
                  key={seat}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`relative overflow-hidden rounded-xl border bg-ash/70 p-5 ${
                    spoke ? `${accent.border} ${accent.glow}` : "border-white/10 opacity-70"
                  }`}
                >
                  {/* Bars, so a silent cell reads as a cell. */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.07]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 14px)",
                    }}
                  />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-lg ${accent.text}`}>{denizen.sigil}</span>
                          <h3 className="font-display text-base font-bold leading-tight text-white">
                            {denizen.alias}
                          </h3>
                        </div>
                        <p className={`mt-0.5 font-mono text-[10px] uppercase ${accent.text}`}>
                          {denizen.title}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          spoke
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                            : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                        }`}
                      >
                        {spoke ? "AWAKE" : "ASLEEP"}
                      </span>
                    </div>

                    <p className="mt-3 text-xs italic leading-relaxed text-zinc-500">
                      {denizen.flavour}
                    </p>

                    {/* The real identity, always visible. Funny names are for the
                        room; this is what you need when something breaks. */}
                    <p className="mt-2 font-mono text-[10px] text-zinc-600">
                      {opinion?.model ?? seat}
                    </p>

                    <div className="mt-4 border-t border-white/10 pt-3">
                      {!opinion && (
                        <p className="font-mono text-[11px] text-zinc-500">
                          Never summoned.
                        </p>
                      )}

                      {opinion?.status === "abstained" && (
                        <>
                          <p className="font-display text-sm text-amber-300">
                            {dungeonReason(opinion.abstainReason ?? "")}
                          </p>
                          {/* Kept verbatim: the joke must not cost you the cause. */}
                          <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                            {opinion.abstainReason}
                          </p>
                        </>
                      )}

                      {spoke && opinion && (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`font-mono text-[10px] ${accent.text}`}>
                              {confidenceRank(opinion.confidence)} ·{" "}
                              {Math.round(opinion.confidence * 100)}%
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {opinion.latencyMs}ms
                            </span>
                            {opinion.totalTokens != null && (
                              <span className="font-mono text-[10px] text-zinc-500">
                                {opinion.totalTokens} tok
                              </span>
                            )}
                          </div>

                          {opinion.dependencies.length === 0 ? (
                            <p className="font-mono text-[11px] text-zinc-500">
                              Found no dependencies.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {opinion.dependencies.map((d, i) => (
                                <li
                                  key={`${d.waiter}-${d.blocker}-${i}`}
                                  className="font-mono text-[11px] leading-relaxed text-zinc-300"
                                >
                                  <span className="text-white">{d.waiter}</span> waits on{" "}
                                  <span className="text-white">{d.blocker}</span>
                                  <span className="text-zinc-500"> — {d.artifact}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {opinion.suggestedAction && (
                            <p className="mt-3 rounded border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-300">
                              {opinion.suggestedAction}
                            </p>
                          )}

                          {opinion.reasoning && (
                            <details className="mt-3 group">
                              <summary className="cursor-pointer font-mono text-[10px] text-zinc-500 hover:text-zinc-300">
                                mutterings
                              </summary>
                              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-zinc-500">
                                {opinion.reasoning}
                              </p>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ── Testimony vs squabble ── */}
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <Panel
              title={LEXICON.consensus}
              subtitle="Every model that spoke named these. The agent acts on them."
              tone="good"
            >
              {verdict.consensus.length === 0 ? (
                <Empty>Nothing was agreed unanimously.</Empty>
              ) : (
                <ul className="space-y-2">
                  {verdict.consensus.map((claim) => (
                    <li
                      key={claim.key}
                      className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2"
                    >
                      <p className="text-sm text-zinc-200">{claim.text}</p>
                      <p className="mt-1 font-mono text-[10px] text-emerald-400/70">
                        sworn by {claim.agreedBy.join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title={LEXICON.dissent}
              subtitle={`Only some models named these, so they go to ${LEXICON.human} instead of being posted as fact.`}
              tone={verdict.dissent.length ? "bad" : "neutral"}
            >
              {verdict.dissent.length === 0 ? (
                <Empty>No squabble. The cells are in accord.</Empty>
              ) : (
                <ul className="space-y-2">
                  {verdict.dissent.map((claim) => (
                    <li
                      key={claim.key}
                      className="rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2"
                    >
                      <p className="text-sm text-zinc-200">{claim.text}</p>
                      <p className="mt-1 font-mono text-[10px] text-red-300/80">
                        claimed only by {claim.agreedBy.join(", ")} — unconfirmed
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ── The Warden ── */}
          <AnimatePresence>
            {pending && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="mb-8 rounded-xl border border-amber-400/40 bg-amber-400/5 p-5 shadow-[0_0_40px_-15px_rgba(251,191,36,0.45)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xl">🗝</span>
                  <h2 className="font-display text-lg font-bold text-white">
                    {LEXICON.human} is needed
                  </h2>
                  <Pill tone="warn">risk: {pending.risk}</Pill>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
                  {pending.reason}
                </p>

                {pending.preview && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                    <p className="mb-1 font-mono text-[10px] uppercase text-zinc-500">
                      proposed
                    </p>
                    <p className="text-sm text-zinc-200">{pending.preview}</p>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() =>
                      void summon("/api/approve", { approvalId: pending.id })
                    }
                    disabled={busy !== null}
                    className="rounded-md bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Unlock the gate
                  </button>
                  <button
                    onClick={() => void summon("/api/stop", { approvalId: pending.id })}
                    disabled={busy !== null}
                    className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 font-mono text-xs font-bold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                  >
                    Leave it locked
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Chronicle ── */}
          <Panel
            title={LEXICON.chronicle}
            subtitle={`What happened during expedition ${run?.id ?? ""}`}
            tone="neutral"
          >
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {(snapshot?.traces ?? [])
                .filter((t) => t.runId === run?.id)
                .slice()
                .reverse()
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex gap-3 rounded border border-white/5 bg-black/20 px-3 py-1.5"
                  >
                    <span
                      className={`shrink-0 font-mono text-[10px] uppercase ${
                        t.kind === "error"
                          ? "text-red-400"
                          : t.kind === "council"
                            ? "text-violet-300"
                            : t.kind === "hitl"
                              ? "text-amber-300"
                              : "text-zinc-500"
                      }`}
                    >
                      {t.kind}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-300">
                      {t.title}
                    </span>
                    <span className="truncate font-mono text-[10px] text-zinc-500">
                      {t.detail}
                    </span>
                  </div>
                ))}
            </div>
          </Panel>

          {/* ── Spoils ── */}
          {(snapshot?.receipts ?? []).length > 0 && (
            <div className="mt-6">
              <Panel
                title={LEXICON.receipt}
                subtitle="What actually landed in the workspace. No receipt means nothing happened."
                tone="good"
              >
                <div className="space-y-2">
                  {(snapshot?.receipts ?? [])
                    .slice(0, 3)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-white/10 bg-black/30 p-3"
                      >
                        <p className="mb-1 font-mono text-[10px] text-zinc-500">
                          {r.channelId} · {r.id}
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {r.body}
                        </p>
                      </div>
                    ))}
                </div>
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const tones = {
    good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    bad: "border-red-400/30 bg-red-400/10 text-red-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    neutral: "border-white/10 bg-white/5 text-zinc-400",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Panel({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "good" | "bad" | "neutral";
  children: React.ReactNode;
}) {
  const borders = {
    good: "border-emerald-400/20",
    bad: "border-red-400/25",
    neutral: "border-white/10",
  };
  return (
    <section className={`rounded-xl border bg-ash/60 p-5 ${borders[tone]}`}>
      <h2 className="font-display text-base font-bold text-white">{title}</h2>
      <p className="mb-4 mt-1 text-xs text-zinc-500">{subtitle}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] text-zinc-500">{children}</p>;
}
