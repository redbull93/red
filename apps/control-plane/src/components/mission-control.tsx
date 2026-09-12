"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { AnimatedRays } from "@/components/ui/animated-rays";
import { GlowBorderCard } from "@/components/ui/glow-border-card";
import { KineticTextLoader } from "@/components/ui/kinetic-text-loader";
import { cn } from "@/lib/utils";

type Trace = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
};

type Approver = {
  userId: string;
  email?: string;
  name?: string;
  roles?: string[];
  orgId?: string;
};

type Approval = {
  id: string;
  reason: string;
  preview: string;
  risk: string;
  principal: string;
  status: string;
  requiredRole?: string;
  resolvedBy?: Approver;
};

type Job = {
  id: string;
  title: string;
  status: string;
  attempt: number;
  lastError?: string;
};

type Receipt = {
  id: string;
  channelId: string;
  body: string;
  at: string;
  approvedBy?: Approver;
  orgId?: string;
};

type Signal = {
  id: string;
  environmentName: string;
  environmentKind: string;
  channelId: string;
  signalBody: string;
  placeOnlyContext: string;
};

type AuthInfo = {
  configured: boolean;
  currentUser?: Approver;
};

type Snapshot = {
  traces: Trace[];
  approvals: Approval[];
  jobs: Job[];
  receipts: Receipt[];
  signals: Signal[];
  auth?: AuthInfo;
};

const empty: Snapshot = {
  traces: [],
  approvals: [],
  jobs: [],
  receipts: [],
  signals: [],
};

export function MissionControl() {
  const [state, setState] = useState<Snapshot>(empty);
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) setState((await res.json()) as Snapshot);
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => setBooted(true), 900);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function fire(
    mode: "loop" | "hitl" | "fail",
    envKind: "slack" | "discord" | "whatsapp" = "slack",
  ) {
    setBusy(true);
    await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, environmentKind: envKind }),
    });
    await refresh();
    setBusy(false);
  }

  async function decide(approvalId: string, path: "approve" | "stop") {
    setBusy(true);
    await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId }),
    });
    await refresh();
    setBusy(false);
  }

  const pending = state.approvals.filter((a) => a.status === "pending");

  // Provide CopilotKit with real-time awareness of the mission control state
  useCopilotReadable({
    description:
      "Current mission control state, including active traces, pending human approvals, jobs, and receipts.",
    value: {
      pendingApprovals: pending,
      traces: state.traces.slice(-5),
      receipts: state.receipts.slice(-5),
      jobs: state.jobs,
      isBusy: busy,
    },
  });

  // Copilot in-app action: trigger standup
  useCopilotAction({
    name: "triggerStandup",
    description:
      "Trigger a new standup collection event for a platform (Slack, Discord, or WhatsApp).",
    parameters: [
      {
        name: "platform",
        type: "string",
        description: "Target platform ('slack', 'discord', or 'whatsapp')",
        required: false,
      },
      {
        name: "mode",
        type: "string",
        description:
          "Run mode: 'loop' (automated), 'hitl' (human-in-the-loop), or 'fail' (error recovery test)",
        required: false,
      },
    ],
    handler: async ({
      platform = "slack",
      mode = "loop",
    }: {
      platform?: string;
      mode?: string;
    }) => {
      const validPlatform =
        platform === "discord" || platform === "whatsapp"
          ? platform
          : "slack";
      const validMode = mode === "hitl" || mode === "fail" ? mode : "loop";
      await fire(validMode, validPlatform);
      return `Triggered ${validMode} standup on ${validPlatform}. Mission Control updated.`;
    },
    render: ({ status, result }) => {
      if (status === "inProgress") {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-950/40 p-2.5 text-xs text-purple-200">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-purple-400" />
            <span>Kicking off team stand-up collection...</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-xs text-emerald-200">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span>{result || "Standup triggered successfully."}</span>
        </div>
      );
    },
  });

  // Copilot in-app action: approve HITL gate
  useCopilotAction({
    name: "approvePendingAction",
    description:
      "Approve a pending human-in-the-loop gate or blocker resolution action.",
    parameters: [
      {
        name: "approvalId",
        type: "string",
        description: "The ID of the approval to grant (e.g. apr_...)",
        required: false,
      },
    ],
    handler: async ({ approvalId }: { approvalId?: string }) => {
      const targetId = approvalId || pending[0]?.id;
      if (!targetId) {
        return "No pending approvals found in Mission Control.";
      }
      await decide(targetId, "approve");
      return `Approved gate ${targetId}. Blocker resolution proceeded.`;
    },
    render: ({ status, result }) => {
      if (status === "inProgress") {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-2.5 text-xs text-amber-200">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-400" />
            <span>Submitting HITL approval...</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-xs text-emerald-200">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span>{result || "Gate approved."}</span>
        </div>
      );
    },
  });

  // Copilot in-app action: stop runaway run
  useCopilotAction({
    name: "stopRun",
    description:
      "Emergency stop an active agent run or pending approval gate.",
    parameters: [
      {
        name: "approvalId",
        type: "string",
        description: "The ID of the approval or run to abort",
        required: false,
      },
    ],
    handler: async ({ approvalId }: { approvalId?: string }) => {
      const targetId = approvalId || pending[0]?.id;
      if (!targetId) {
        return "No active approval or run to stop.";
      }
      await decide(targetId, "stop");
      return `Emergency stop executed for ${targetId}.`;
    },
    render: ({ status, result }) => {
      if (status === "inProgress") {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-200">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-rose-400" />
            <span>Executing emergency stop...</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-2.5 text-xs text-rose-200">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
          <span>{result || "Emergency stop executed."}</span>
        </div>
      );
    },
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <AnimatedRays />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.08),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(232,121,249,0.1),transparent_30%)]" />

      <AnimatePresence>
        {!booted && (
          <motion.div
            className="absolute inset-0 z-50 grid place-items-center bg-ink"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <KineticTextLoader text="CONTROL" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1500px] flex-col gap-5 px-5 py-6 md:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-fuchsia-300/80">
              StandUp Agent · Vengeance mission control · not the home
            </p>
            <h1 className="mt-2 font-display text-4xl leading-none tracking-tight md:text-6xl">
              The agent lives
              <span className="block bg-gradient-to-r from-sky-300 via-fuchsia-300 to-teal-200 bg-clip-text text-transparent">
                in Slack, Discord & WhatsApp.
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <FireButton disabled={busy} onClick={() => void fire("loop", "slack")} label="Slack loop" />
            <FireButton disabled={busy} onClick={() => void fire("loop", "whatsapp")} label="WhatsApp loop" />
            <FireButton disabled={busy} onClick={() => void fire("loop", "discord")} label="Discord loop" />
            <FireButton disabled={busy} onClick={() => void fire("hitl")} label="Pause HITL" tone="warn" />
            <FireButton disabled={busy} onClick={() => void fire("fail")} label="Force fail + retry" tone="danger" />
          </div>
        </header>

        {/* Auth0 Identity & Session Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              Auth0 Identity:
            </span>
            <span className="font-mono text-xs font-medium text-zinc-200">
              {state.auth?.currentUser?.name ?? "Lead Engineer (Local Dev)"}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              ({state.auth?.currentUser?.email ?? "lead@red.dev"})
            </span>
            <div className="flex gap-1">
              {(state.auth?.currentUser?.roles ?? ["tech-lead", "admin"]).map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-fuchsia-300"
                >
                  {r}
                </span>
              ))}
            </div>
            {state.auth?.currentUser?.orgId && (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-300">
                Org: {state.auth.currentUser.orgId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.auth?.configured ? (
              <a
                href="/api/auth/logout"
                className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-rose-300 transition"
              >
                Logout ↗
              </a>
            ) : (
              <a
                href="/api/auth/login"
                className="font-mono text-[10px] uppercase tracking-wider text-sky-400 hover:text-sky-300 transition"
              >
                Sign in with Auth0 ↗
              </a>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-full border border-white/10 bg-white/5 py-2">
          <div className="animate-ticker flex w-[200%] gap-12 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-400">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i}>
                standup · slack · discord · whatsapp · cross-reference · channel receipt ·
                do not demo only this screen ·
              </span>
            ))}
          </div>
        </div>

        <div className="grid flex-1 gap-4 lg:grid-cols-12">
          <GlowBorderCard
            className="lg:col-span-3 min-h-[420px] w-full"
            width="100%"
            colorPreset="ocean"
            inset="-0.6em"
            borderWidth="0.7em"
            blurAmount="0.55em"
          >
            <SectionLabel>Stand-up signals</SectionLabel>
            <p className="mb-4 font-mono text-[11px] text-zinc-500">
              Fixture: Eugene / Brian / Amina. Wire Slack, Discord, or WhatsApp
              before you film.
            </p>
            <Feed
              empty="No signal yet. Fire a fixture."
              items={state.signals.map((s) => ({
                id: s.id,
                kicker: `${s.environmentKind} · ${s.channelId}`,
                title: s.environmentName,
                body: s.placeOnlyContext,
              }))}
            />
          </GlowBorderCard>

          <GlowBorderCard
            className="lg:col-span-5 min-h-[420px] w-full"
            width="100%"
            colorPreset="aurora"
            inset="-0.6em"
            borderWidth="0.7em"
            blurAmount="0.55em"
          >
            <SectionLabel>Live traces</SectionLabel>
            <Equalizer />
            <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
              <AnimatePresence initial={false}>
                {state.traces.slice(0, 24).map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn("font-mono text-[10px] uppercase tracking-widest", kindColor(t.kind))}>
                        {t.kind}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-600">
                        {t.at.slice(11, 19)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-100">{t.title}</p>
                    <p className="text-xs text-zinc-500">{t.detail}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
              {state.traces.length === 0 && (
                <p className="text-sm text-zinc-500">Waiting for a loop.</p>
              )}
            </div>
          </GlowBorderCard>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <GlowBorderCard
              className="min-h-[220px] w-full"
              width="100%"
              colorPreset="sunset"
              inset="-0.6em"
              borderWidth="0.7em"
              blurAmount="0.55em"
            >
              <SectionLabel>Human override</SectionLabel>
              {pending.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No pending approval. Controllability still has to be one tap
                  in the real environment too.
                </p>
              ) : (
                pending.map((a) => (
                  <div key={a.id} className="space-y-3">
                    <p className="text-sm text-zinc-200">{a.reason}</p>
                    <p className="font-mono text-xs text-zinc-500">{a.preview}</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
                      {a.risk} · {a.principal}
                    </p>
                    <div className="flex gap-2">
                      <FireButton
                        disabled={busy}
                        label="Approve"
                        onClick={() => void decide(a.id, "approve")}
                      />
                      <FireButton
                        disabled={busy}
                        label="Stop"
                        tone="danger"
                        onClick={() => void decide(a.id, "stop")}
                      />
                    </div>
                  </div>
                ))
              )}
            </GlowBorderCard>

            <GlowBorderCard
              className="min-h-[180px] w-full"
              width="100%"
              colorPreset="nature"
              inset="-0.6em"
              borderWidth="0.7em"
              blurAmount="0.55em"
            >
              <SectionLabel>Durable jobs</SectionLabel>
              <Feed
                empty="No jobs. Trigger.dev can replace this stub."
                items={state.jobs.map((j) => ({
                  id: j.id,
                  kicker: `${j.status} · try ${j.attempt}`,
                  title: j.title,
                  body: j.lastError ?? "Local queue — swap for Trigger.dev",
                }))}
              />
            </GlowBorderCard>
          </div>
        </div>

        <GlowBorderCard
          className="w-full"
          width="100%"
          colorPreset="custom"
          inset="-0.5em"
          borderWidth="0.55em"
          blurAmount="0.4em"
        >
          <SectionLabel>Channel receipts (must land in Slack, Discord, or WhatsApp)</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-3">
            {state.receipts.length === 0 && (
              <p className="text-sm text-zinc-500">
                After world.act, environment.receipt writes the stand-up summary
                back to the team channel. If this list grows and your platform does not, you
                are filming theater.
              </p>
            )}
            {state.receipts.map((r) => (
              <div
                key={r.id}
                className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-teal-300">
                    {r.channelId}
                  </p>
                  {r.approvedBy && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] text-emerald-300">
                      ✓ Approved: {r.approvedBy.name ?? r.approvedBy.userId}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-100">{r.body}</p>
              </div>
            ))}
          </div>
        </GlowBorderCard>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-400">
      {children}
    </p>
  );
}

function FireButton({
  label,
  onClick,
  disabled,
  tone = "ok",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition",
        "disabled:opacity-40",
        tone === "ok" &&
          "border-sky-400/40 bg-sky-400/10 text-sky-100 hover:bg-sky-400/20",
        tone === "warn" &&
          "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
        tone === "danger" &&
          "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
      )}
    >
      {label}
    </button>
  );
}

function Feed({
  items,
  empty,
}: {
  empty: string;
  items: { id: string; kicker: string; title: string; body: string }[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {item.kicker}
          </p>
          <p className="text-sm text-zinc-100">{item.title}</p>
          <p className="text-xs text-zinc-500">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function Equalizer() {
  return (
    <div className="flex h-8 items-end gap-1">
      {Array.from({ length: 16 }).map((_, i) => (
        <span
          key={i}
          className="w-1 flex-1 origin-bottom bg-gradient-to-t from-fuchsia-500 to-sky-300 animate-pulsebar"
          style={{ animationDelay: `${i * 70}ms`, height: "100%" }}
        />
      ))}
    </div>
  );
}

function kindColor(kind: string) {
  if (kind === "error") return "text-rose-300";
  if (kind === "hitl") return "text-amber-300";
  if (kind === "receipt") return "text-teal-300";
  if (kind === "tool") return "text-sky-300";
  if (kind === "job") return "text-fuchsia-300";
  return "text-zinc-400";
}
