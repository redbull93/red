import {
  createMemoryPlace,
  dispatchTool,
  type PlaceSnapshot,
} from "@red/mcp-tools";
import { renderEnvironmentBlock, toAgentContext } from "./context";
import {
  councilEnabled,
  needsHuman,
  renderVerdictBlock,
  runCouncil,
  summarizeVerdict,
} from "./council";
import { uid } from "./ids";
import { cancelRunJobs, enqueueJob, setJobStatus } from "./jobs";
import { completeTurn, type ChatMessage, type TurnContext } from "./llm";
import { SYSTEM_PROMPT, TOOL_PREAMBLE } from "./prompts";
import { emitAgUi } from "./ag-ui";
import { getStore } from "./store";
import { trace } from "./traces";
import { recordBlockers, renderMemoryContext } from "./memory";
import { validateAction, validateApproverPermission } from "./guardrails";
import type {
  Approval,
  ApproverIdentity,
  CouncilVerdict,
  EnvironmentEvent,
  Run,
} from "./types";

const places = new Map<string, PlaceSnapshot>();

export type ReceiptInput = {
  channelId: string;
  body: string;
  receiptId?: string;
};

export type ReceiptSink = (input: ReceiptInput) => Promise<void> | void;

let receiptSink: ReceiptSink | undefined;

/** Slack/Discord adapters register this so environment.receipt lands in the place. */
export function setReceiptSink(sink: ReceiptSink | undefined) {
  receiptSink = sink;
}

function toolContext(
  runId: string,
  orgId?: string,
  approver?: ApproverIdentity,
) {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      now: () => new Date(),
      readPlace: (channelId: string) => places.get(channelId) ?? null,
      writeReceipt: (input: ReceiptInput) => {
        const existing = places.get(input.channelId);
        const memory = createMemoryPlace(existing ?? undefined);
        const written = memory.writeReceipt(input);
        const next = memory.readPlace(input.channelId);
        if (next) places.set(input.channelId, next);
        getStore().receipts.push({
          id: written.receiptId,
          runId,
          channelId: input.channelId,
          body: input.body,
          at: written.landedAt,
          approvedBy: approver,
          orgId,
        });
        if (receiptSink) {
          pending.push(Promise.resolve(receiptSink({ ...input, ...written })));
        }
        return written;
      },
    },
    flush: async () => {
      await Promise.all(pending);
    },
  };
}

function seedPlace(event: ReturnType<typeof toAgentContext>) {
  places.set(event.channelId, {
    environmentName: event.environmentName,
    environmentKind: event.environmentKind,
    channelId: event.channelId,
    threadId: event.threadId,
    recent: [event.signalBody],
    placeOnlyContext: event.placeOnlyContext,
  });
}

/**
 * Runs the council and traces each seat separately, so the control plane can show
 * three lanes and name any model that abstained. Returns undefined when the
 * council is off or has no key, in which case the loop behaves as it did before.
 */
async function councilPass(
  runId: string,
  event: ReturnType<typeof toAgentContext>,
): Promise<CouncilVerdict | undefined> {
  if (!councilEnabled()) return undefined;

  const verdict = await runCouncil(event);

  trace(
    runId,
    "council",
    verdict.cached ? "Council (replayed capture)" : "Council",
    summarizeVerdict(verdict),
    {
      seated: verdict.seated,
      consensus: verdict.consensus.map((c) => c.text),
      dissent: verdict.dissent.map((c) => ({ text: c.text, agreedBy: c.agreedBy })),
      cached: verdict.cached,
    },
  );

  for (const opinion of verdict.opinions) {
    if (opinion.status === "abstained") {
      trace(
        runId,
        "council",
        `${opinion.label} abstained`,
        opinion.abstainReason ?? "unknown",
        { seat: opinion.seat, model: opinion.model, latencyMs: opinion.latencyMs },
      );
      continue;
    }
    trace(
      runId,
      "council",
      `${opinion.label} answered`,
      opinion.dependencies.length
        ? opinion.dependencies
            .map((d) => `${d.waiter} waits on ${d.blocker} (${d.artifact})`)
            .join("; ")
        : "no dependencies found",
      {
        seat: opinion.seat,
        model: opinion.model,
        confidence: opinion.confidence,
        suggestedAction: opinion.suggestedAction,
        reasoning: opinion.reasoning?.slice(0, 600),
        latencyMs: opinion.latencyMs,
        totalTokens: opinion.totalTokens,
      },
    );
  }

  return verdict;
}

/**
 * Names the reason that actually caused the pause, in the order the loop checks
 * them. Getting this order wrong is not cosmetic: a run paused by policy was
 * reporting "only 1 model answered", which sends whoever reads the approval card
 * chasing a quota problem that had nothing to do with it.
 */
function approvalReason(input: {
  mayAct: boolean;
  requireHitl?: boolean;
  verdict?: CouncilVerdict;
}): string {
  if (!input.mayAct) return "No actor on this event may act.";

  if (input.verdict?.dissent.length) {
    const contested = input.verdict.dissent
      .map((c) => `${c.text} (only ${c.agreedBy.join(", ")})`)
      .join("; ");
    return `The council split. Contested: ${contested}`;
  }

  if (input.requireHitl) {
    // The council standing is still worth stating, but as context rather than as
    // the cause.
    const context = input.verdict?.unverified
      ? ` Council was uncorroborated (${input.verdict.seated.length} of ${input.verdict.opinions.length} answered).`
      : "";
    return `Policy: irreversible or flagged act needs a human.${context}`;
  }

  if (input.verdict?.unverified) {
    const abstained = input.verdict.abstained
      .map((a) => `${a.label} ${a.reason}`)
      .join("; ");
    return `Only ${input.verdict.seated.length} model answered, so nothing was corroborated. ${abstained}`;
  }

  return "Policy: irreversible or flagged act needs a human.";
}

export async function ingestEnvironmentEvent(
  raw: EnvironmentEvent,
  options: { verdict?: CouncilVerdict } = {},
): Promise<Run> {
  const event = toAgentContext(raw);
  const store = getStore();
  store.signals.push(event);
  seedPlace(event);

  const run: Run = {
    id: uid("run"),
    status: "running",
    event,
    startedAt: new Date().toISOString(),
  };
  store.runs.push(run);
  emitAgUi({ type: "RunStarted", runId: run.id });

  trace(
    run.id,
    "signal",
    `Signal in ${event.environmentName}`,
    event.signalBody,
    { kind: event.environmentKind, channelId: event.channelId, orgId: event.orgId },
  );
  trace(
    run.id,
    "context",
    "Place-only context",
    event.placeOnlyContext || "EMPTY — environment may be a wrapper",
  );

  const job = enqueueJob(run.id, `Loop for ${event.channelId}`);
  setJobStatus(job.id, "running");
  trace(run.id, "job", "Job running", job.title, { jobId: job.id });

  // ── Cross-run memory: record blockers and inject prior context ──
  const blockers = recordBlockers(
    run.id,
    event.channelId,
    event.actors,
    event.signalBody,
    event.orgId,
  );
  if (blockers.length > 0) {
    trace(run.id, "context", "Blockers detected", `${blockers.length} blocker(s) recorded`, {
      blockers: blockers.map((b) => ({ from: b.from, to: b.to, streak: b.streak })),
    });
  }

  // ── Model council: three models cross-reference the same stand-up ──
  // A re-ingest after approval reuses the verdict the human already saw, rather
  // than spending another three model calls to re-derive it.
  const verdict = options.verdict ?? (await councilPass(run.id, event));
  if (verdict) run.verdict = verdict;
  if (options.verdict) {
    trace(
      run.id,
      "council",
      "Council verdict carried over",
      `Human approved: ${summarizeVerdict(options.verdict)}`,
    );
  }

  const memoryBlock = renderMemoryContext(event.channelId, event.orgId);
  const systemContent = memoryBlock
    ? `${SYSTEM_PROMPT}\n\n${TOOL_PREAMBLE}\n\n${memoryBlock}`
    : `${SYSTEM_PROMPT}\n\n${TOOL_PREAMBLE}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: renderEnvironmentBlock(event) },
  ];
  if (verdict) {
    messages.push({ role: "user", content: renderVerdictBlock(verdict) });
  }

  const { ctx, flush } = toolContext(
    run.id,
    event.orgId,
    event.authenticatedUser,
  );
  const mayAct = event.actors.some((a) => a.mayAct);
  // Disagreement between models is a reason to ask a human, exactly as
  // prompts/hitl.md already says for tools that disagree.
  const councilPause = verdict && !event.councilApproved ? needsHuman(verdict) : false;

  if (event.requireHitl || !mayAct || councilPause) {
    const approval: Approval = {
      id: uid("apr"),
      runId: run.id,
      at: new Date().toISOString(),
      reason: approvalReason({ mayAct, requireHitl: event.requireHitl, verdict }),
      proposedAction: "world.act",
      preview: verdict?.suggestedAction || event.signalBody.slice(0, 180),
      risk: event.urgency === "high" ? "high" : "medium",
      requiredRole: event.urgency === "high" ? "tech-lead" : undefined,
      principal: event.principal ?? event.actors[0]?.id ?? "human",
      status: "pending",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      orgId: event.orgId,
      dissent: verdict?.dissent.length ? verdict.dissent : undefined,
      // Attached whatever triggered the pause: whoever is deciding should see
      // where the council stood, not only the claims that were contested.
      opinions: verdict?.opinions,
    };
    store.approvals.push(approval);
    run.status = "awaiting_hitl";
    setJobStatus(job.id, "queued");
    trace(run.id, "hitl", "Paused for approval", approval.reason, {
      approvalId: approval.id,
      requiredRole: approval.requiredRole,
    });
    emitAgUi({
      type: "HitlRequired",
      runId: run.id,
      approvalId: approval.id,
    });
    return run;
  }

  try {
    for (let step = 0; step < 6; step += 1) {
      // ── Usage tracking context ──
      const turnCtx: TurnContext = {
        runId: run.id,
        turnIndex: step,
        orgId: event.orgId,
        userId: event.authenticatedUser?.userId,
      };
      const turn = await completeTurn(messages, turnCtx);
      if (turn.text) {
        run.assistantText = turn.text;
        trace(run.id, "plan", turn.stub ? "Stub plan" : "Model plan", turn.text);
      }

      if (turn.toolCalls.length === 0) {
        run.status = "completed";
        run.finishedAt = new Date().toISOString();
        setJobStatus(job.id, "succeeded");
        await flush();
        emitAgUi({ type: "RunFinished", run });
        return run;
      }

      messages.push({
        role: "assistant",
        content: turn.text || "",
        // The tool results appended below are replies to these calls, and strict
        // providers reject the next turn if the link is missing.
        toolCalls: turn.toolCalls,
        reasoning: turn.reasoning,
      });

      // ── Parallel tool dispatch ──
      // Separate tools into serial (world.act — needs guardrails + HITL gate)
      // and parallel (everything else can run concurrently).
      const serialCalls = turn.toolCalls.filter((c) => c.name === "world.act");
      const parallelCalls = turn.toolCalls.filter((c) => c.name !== "world.act");

      // Dispatch independent tools concurrently
      const parallelResults = await Promise.all(
        parallelCalls.map(async (call) => {
          const result = await dispatchTool(call.name, call.args, ctx);
          return { call, result };
        }),
      );

      // Process parallel results
      for (const { call, result } of parallelResults) {
        if (result.receiptId) {
          trace(run.id, "receipt", "Receipt", result.receiptId, result.data);
        }

        trace(
          run.id,
          result.ok ? "tool" : "error",
          call.name,
          result.ok ? "ok" : (result.error ?? "failed"),
          result.data,
        );

        if (call.name === "health.fail" || !result.ok) {
          setJobStatus(job.id, "retrying", result.error);
          trace(run.id, "job", "Retrying", result.error ?? "tool failed", {
            jobId: job.id,
          });
        }
        if (call.name === "health.retry") {
          setJobStatus(job.id, "running");
        }

        messages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }

      // Dispatch serial tools (world.act) with guardrails
      for (const call of serialCalls) {
        if (event.requireHitl) {
          run.status = "awaiting_hitl";
          return run;
        }

        // ── Guardrail validation ──
        const guardrailResult = validateAction(call, event);
        trace(run.id, "tool", "Guardrail check", guardrailResult.pass ? "passed" : "blocked", {
          violations: guardrailResult.violations,
        });

        if (!guardrailResult.pass) {
          // Guardrail blocked the action — treat as a soft failure
          const blockReasons = guardrailResult.violations
            .filter((v) => v.severity === "block")
            .map((v) => v.detail)
            .join("; ");

          trace(run.id, "error", "Guardrail blocked", blockReasons);

          messages.push({
            role: "tool",
            name: call.name,
            tool_call_id: call.id,
            content: JSON.stringify({
              ok: false,
              tool: call.name,
              data: {},
              error: `Guardrail blocked: ${blockReasons}`,
            }),
          });
          continue;
        }

        const result = await dispatchTool(call.name, call.args, ctx);
        if (result.receiptId) {
          trace(run.id, "receipt", "Receipt", result.receiptId, result.data);
        }

        trace(
          run.id,
          result.ok ? "tool" : "error",
          call.name,
          result.ok ? "ok" : (result.error ?? "failed"),
          result.data,
        );

        messages.push({
          role: "tool",
          name: call.name,
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    run.status = "completed";
    run.finishedAt = new Date().toISOString();
    setJobStatus(job.id, "succeeded");
    await flush();
    emitAgUi({ type: "RunFinished", run });
    return run;
  } catch (error) {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "unknown error";
    setJobStatus(job.id, "failed", message);
    trace(run.id, "error", "Loop failed", message);
    emitAgUi({ type: "RunFinished", run });
    return run;
  }
}

export async function resolveApproval(
  approvalId: string,
  decision: "approved" | "approve" | "stopped" | "stop",
  approver?: ApproverIdentity,
): Promise<Run | undefined> {
  const store = getStore();
  const approval = store.approvals.find((a) => a.id === approvalId);
  if (!approval || approval.status !== "pending") return undefined;

  // RBAC permission check
  const rbacCheck = validateApproverPermission(approval.requiredRole, approver);
  if (!rbacCheck.pass) {
    trace(
      approval.runId,
      "error",
      "Approval unauthorized",
      rbacCheck.violations.map((v) => v.detail).join("; "),
      { requiredRole: approval.requiredRole, approver },
    );
    throw new Error(
      `Permission Denied: ${rbacCheck.violations.map((v) => v.detail).join("; ")}`,
    );
  }
  
  const isStop = decision === "stopped" || decision === "stop";
  approval.status = isStop ? "stopped" : "approved";
  approval.resolvedBy = approver;
  approval.resolvedAt = new Date().toISOString();

  const run = store.runs.find((r) => r.id === approval.runId);
  if (!run) return undefined;

  const approverLabel =
    approver?.name ?? approver?.email ?? approver?.userId ?? "human";

  if (isStop) {
    run.status = "stopped";
    run.finishedAt = new Date().toISOString();
    cancelRunJobs(run.id);
    const { ctx, flush } = toolContext(run.id, run.event.orgId, approver);
    await dispatchTool(
      "environment.receipt",
      {
        channelId: run.event.channelId,
        body: `Stopped by ${approverLabel}. Nothing else will run.`,
      },
      ctx,
    );
    await flush();
    trace(
      run.id,
      "hitl",
      "Stopped by human",
      `Stopped by ${approverLabel}. The human kept control.`,
      { approver },
    );
    emitAgUi({ type: "RunFinished", run });
    return run;
  }

  run.event.requireHitl = false;
  run.event.authenticatedUser = approver;
  run.status = "running";
  trace(
    run.id,
    "hitl",
    "Approved by human",
    `Approved by ${approverLabel}. Running the proposed act.`,
    { approver },
  );
  return ingestEnvironmentEvent(
    {
      ...run.event,
      id: uid("evt"),
      requireHitl: false,
      authenticatedUser: approver,
      // Without this the replayed event hits the same council dissent and pauses
      // again, ignoring the decision the human just made.
      councilApproved: true,
    },
    { verdict: run.verdict },
  );
}

export function fixtureEvent(
  overrides: Partial<EnvironmentEvent> = {},
): EnvironmentEvent {
  const cleaned = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<EnvironmentEvent>;

  return {
    environmentName: "Slack #standup",
    environmentKind: "slack",
    channelId: "C-standup",
    threadId: "standup-2026-09-12",
    signalType: "standup.collected",
    signalBody: [
      "Morning stand-up replies collected.",
      "",
      "Eugene: Can't finish the dashboard until I get the API endpoint from Brian.",
      "Brian: API endpoint is done, just haven't sent Eugene the docs yet.",
      "Amina: Finished onboarding docs. Working on billing polish. No blockers.",
    ].join("\n"),
    placeOnlyContext:
      "These three DM replies arrived for the scheduled stand-up. Eugene names Brian; Brian finished the API but did not close the loop. A chatbox would never own this morning ritual or post the receipt into #standup.",
    actors: [
      {
        id: "eugene",
        role: "teammate",
        present: true,
        mayAct: true,
        language: "en",
      },
      {
        id: "brian",
        role: "teammate",
        present: true,
        mayAct: true,
        language: "en",
      },
      {
        id: "amina",
        role: "teammate",
        present: true,
        mayAct: true,
        language: "en",
      },
    ],
    artifacts: [
      {
        kind: "standup_reply",
        id: "eugene",
        summary:
          "Can't finish the dashboard until I get the API endpoint from Brian.",
      },
      {
        kind: "standup_reply",
        id: "brian",
        summary:
          "API endpoint is done, just haven't sent Eugene the docs yet.",
      },
      {
        kind: "standup_reply",
        id: "amina",
        summary: "Finished onboarding docs. Billing polish. No blockers.",
      },
    ],
    urgency: "medium",
    principal: "standup-lead",
    ...cleaned,
  };
}
