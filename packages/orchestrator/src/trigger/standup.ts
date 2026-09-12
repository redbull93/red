import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import {
  councilEnabled,
  fixtureEvent,
  getStore,
  hasRouterKey,
  ingestEnvironmentEvent,
  loadRuntimeEnv,
  resolveApproval,
  SEAT_LABELS,
  summarizeVerdict,
} from "../index";
import type { EnvironmentEvent } from "../types";

/**
 * Durable stand-up jobs.
 *
 * Three things here are real rather than simulated, and each one is a thing the
 * in-memory queue in jobs.ts cannot do:
 *
 *   1. The morning run is a cron owned by the platform, so it fires whether or
 *      not anyone is watching, and survives this process dying.
 *   2. A failed run is retried with backoff by the platform, from the attempt
 *      that failed — not by a setTimeout that dies with the process.
 *   3. The approval gate is a real waitpoint. The run suspends, costs nothing
 *      while suspended, and resumes when a human answers, even hours later.
 *
 * jobs.ts stays as the control plane's view of job state; these tasks are what
 * actually make the schedule durable.
 */

loadRuntimeEnv();

// ── 1. The morning stand-up, on a schedule ────────────────────────

export const morningStandup = schedules.task({
  id: "morning-standup",
  // 09:00 on weekdays, in the team's actual timezone. Trigger.dev handles DST,
  // which is why this is not a UTC cron with a comment apologising for drift.
  cron: {
    pattern: "0 9 * * 1-5",
    timezone: "Africa/Nairobi",
  },
  maxDuration: 600,
  run: async (payload) => {
    logger.info("Stand-up window opened", {
      scheduledAt: payload.timestamp,
      lastRun: payload.lastTimestamp,
      timezone: payload.timezone,
      council: councilEnabled() ? "on" : "off",
      router: hasRouterKey() ? "live" : "stub",
    });

    // On the day this is replaced by the real environment payload. The fixture
    // keeps the schedule provably working before the adapter is wired.
    const event = fixtureEvent({
      occurredAt: payload.timestamp.toISOString(),
      localTime: payload.timestamp.toISOString(),
    });

    const run = await ingestEnvironmentEvent(event);

    if (run.verdict) {
      logger.info(`Council: ${summarizeVerdict(run.verdict)}`, {
        seated: run.verdict.seated,
        consensus: run.verdict.consensus.map((c) => c.text),
        dissent: run.verdict.dissent.map((c) => c.text),
        // Naming who sat out and why is the honest version of "3 models agreed".
        abstained: run.verdict.abstained,
      });
    }

    if (run.status === "awaiting_hitl") {
      const approval = getStore().approvals.find(
        (a) => a.runId === run.id && a.status === "pending",
      );
      logger.warn("Paused for a human", {
        approvalId: approval?.id,
        reason: approval?.reason,
      });
      return {
        runId: run.id,
        status: run.status,
        approvalId: approval?.id,
        awaitingHuman: true,
      };
    }

    // A run that produced no receipt did not actually do anything. Throwing here
    // is deliberate: it makes the platform retry rather than logging a
    // successful-looking no-op.
    const receipts = getStore().receipts.filter((r) => r.runId === run.id);
    if (run.status === "completed" && receipts.length === 0) {
      throw new Error(
        `Run ${run.id} completed without landing a receipt — nothing reached the team`,
      );
    }

    logger.info("Stand-up closed", {
      runId: run.id,
      status: run.status,
      receipts: receipts.length,
    });

    return {
      runId: run.id,
      status: run.status,
      receipts: receipts.length,
      seated: run.verdict?.seated.map((s) => SEAT_LABELS[s as keyof typeof SEAT_LABELS] ?? s),
    };
  },
});

// ── 2. Ad-hoc stand-up, retried by the platform ───────────────────

export const standupRun = task({
  id: "standup-run",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 20_000,
    factor: 2,
    randomize: true,
  },
  run: async (payload: { event: EnvironmentEvent }, { ctx }) => {
    logger.info("Stand-up run", { attempt: ctx.attempt.number });

    const run = await ingestEnvironmentEvent(payload.event);

    // Agent Router rations GPT and Opus daily, so a thin council is expected and
    // must not burn retries. A run that reached no model at all is worth
    // retrying, because that is usually a transient gateway problem.
    if (run.verdict && run.verdict.seated.length === 0 && hasRouterKey()) {
      throw new Error(
        `No council seat answered: ${run.verdict.abstained
          .map((a) => `${a.label} ${a.reason}`)
          .join("; ")}`,
      );
    }

    return { runId: run.id, status: run.status };
  },
});

// ── 3. The approval gate, as a real waitpoint ─────────────────────

export const standupWithApproval = task({
  id: "standup-with-approval",
  run: async (payload: { event: EnvironmentEvent; timeoutMinutes?: number }) => {
    const run = await ingestEnvironmentEvent(payload.event);

    if (run.status !== "awaiting_hitl") {
      return { runId: run.id, status: run.status, waited: false };
    }

    const approval = getStore().approvals.find(
      (a) => a.runId === run.id && a.status === "pending",
    );
    logger.info("Waiting on a human", {
      approvalId: approval?.id,
      reason: approval?.reason,
      contested: run.verdict?.dissent.map((c) => c.text),
    });

    // A real waitpoint: the run suspends and is billed nothing while it waits.
    // The token id is what the control plane completes when someone clicks.
    const token = await wait.createToken({
      timeout: `${payload.timeoutMinutes ?? 15}m`,
      tags: [`approval:${approval?.id ?? run.id}`],
    });

    logger.info("Waitpoint open", { tokenId: token.id, approvalId: approval?.id });

    const result = await wait.forToken<{
      decision: "approve" | "stop";
      approver?: { userId: string; email?: string; name?: string; roles?: string[] };
    }>(token);

    if (!result.ok) {
      // Timing out is a decision. Doing nothing is safer than acting on a stale
      // approval nobody granted.
      logger.warn("Approval timed out — not acting", { runId: run.id });
      return { runId: run.id, status: "expired", waited: true };
    }

    const decided = await resolveApproval(
      approval?.id ?? "",
      result.output.decision,
      result.output.approver,
    );

    return {
      runId: decided?.id ?? run.id,
      status: decided?.status ?? run.status,
      decision: result.output.decision,
      waited: true,
    };
  },
});

// ── 4. Retry demo: the failure path, durably ───────────────────────

export const standupRetryDemo = task({
  id: "standup-retry-demo",
  retry: { maxAttempts: 3, minTimeoutInMs: 1_000, factor: 2 },
  run: async (payload: { failUntilAttempt?: number }, { ctx }) => {
    const failUntil = payload.failUntilAttempt ?? 2;
    logger.info("Attempt", { attempt: ctx.attempt.number, failUntil });

    if (ctx.attempt.number < failUntil) {
      // Thrown, not caught: the platform owns the backoff, and the run's own
      // history shows attempt 1 failing and attempt 2 succeeding.
      throw new Error(
        `Synthetic failure on attempt ${ctx.attempt.number} — the platform will retry`,
      );
    }

    // Brief settle before the retry succeeds, so the recovery is visible on film.
    await wait.for({ seconds: 2 });

    const run = await ingestEnvironmentEvent(fixtureEvent());
    return { runId: run.id, status: run.status, recoveredOnAttempt: ctx.attempt.number };
  },
});
