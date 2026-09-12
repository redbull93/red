import { getStore } from "./store";
import { uid } from "./ids";
import type { Job, JobStatus } from "./types";

/** Local durable-job stub. Swap enqueue() for Trigger.dev on the day. */
export function enqueueJob(runId: string, title: string): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: uid("job"),
    runId,
    title,
    status: "queued",
    attempt: 1,
    createdAt: now,
    updatedAt: now,
  };
  getStore().jobs.push(job);
  return job;
}

export function setJobStatus(
  jobId: string,
  status: JobStatus,
  lastError?: string,
): Job | undefined {
  const job = getStore().jobs.find((j) => j.id === jobId);
  if (!job) return undefined;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  if (status === "retrying") job.attempt += 1;
  if (lastError) job.lastError = lastError;
  return job;
}

export function cancelRunJobs(runId: string) {
  for (const job of getStore().jobs) {
    if (job.runId === runId && job.status !== "succeeded") {
      job.status = "cancelled";
      job.updatedAt = new Date().toISOString();
    }
  }
}
