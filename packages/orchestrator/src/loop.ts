import {
  createMemoryPlace,
  dispatchTool,
  type PlaceSnapshot,
} from "@red/mcp-tools";
import { renderEnvironmentBlock, toAgentContext } from "./context";
import { uid } from "./ids";
import { cancelRunJobs, enqueueJob, setJobStatus } from "./jobs";
import { completeTurn, type ChatMessage } from "./llm";
import { SYSTEM_PROMPT, TOOL_PREAMBLE } from "./prompts";
import { emitAgUi } from "./ag-ui";
import { getStore } from "./store";
import { trace } from "./traces";
import type { Approval, EnvironmentEvent, Run } from "./types";

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

function toolContext(runId: string) {
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

export async function ingestEnvironmentEvent(
  raw: EnvironmentEvent,
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
    { kind: event.environmentKind, channelId: event.channelId },
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

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${TOOL_PREAMBLE}` },
    { role: "user", content: renderEnvironmentBlock(event) },
  ];

  const { ctx, flush } = toolContext(run.id);
  const mayAct = event.actors.some((a) => a.mayAct);
  if (event.requireHitl || !mayAct) {
    const approval: Approval = {
      id: uid("apr"),
      runId: run.id,
      at: new Date().toISOString(),
      reason: mayAct
        ? "Policy: irreversible or flagged act needs a human."
        : "No actor on this event may act.",
      proposedAction: "world.act",
      preview: event.signalBody.slice(0, 180),
      risk: event.urgency === "high" ? "high" : "medium",
      principal: event.principal ?? event.actors[0]?.id ?? "human",
      status: "pending",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    store.approvals.push(approval);
    run.status = "awaiting_hitl";
    setJobStatus(job.id, "queued");
    trace(run.id, "hitl", "Paused for approval", approval.reason, {
      approvalId: approval.id,
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
      const turn = await completeTurn(messages);
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
      });

      for (const call of turn.toolCalls) {
        if (call.name === "world.act" && event.requireHitl) {
          run.status = "awaiting_hitl";
          return run;
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
  decision: "approved" | "stopped",
): Promise<Run | undefined> {
  const store = getStore();
  const approval = store.approvals.find((a) => a.id === approvalId);
  if (!approval || approval.status !== "pending") return undefined;
  approval.status = decision;
  const run = store.runs.find((r) => r.id === approval.runId);
  if (!run) return undefined;

  if (decision === "stopped") {
    run.status = "stopped";
    run.finishedAt = new Date().toISOString();
    cancelRunJobs(run.id);
    const { ctx, flush } = toolContext(run.id);
    await dispatchTool(
      "environment.receipt",
      {
        channelId: run.event.channelId,
        body: "Stopped. Nothing else will run.",
      },
      ctx,
    );
    await flush();
    trace(run.id, "hitl", "Stopped by human", "The human kept control.");
    emitAgUi({ type: "RunFinished", run });
    return run;
  }

  run.event.requireHitl = false;
  run.status = "running";
  trace(run.id, "hitl", "Approved", "Running the proposed act.");
  return ingestEnvironmentEvent({
    ...run.event,
    id: uid("evt"),
    requireHitl: false,
  });
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
