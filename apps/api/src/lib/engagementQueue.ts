/**
 * BullMQ queue for Instagram comment auto-reply jobs.
 *
 * Entirely separate from post-jobs (queue.ts/worker.ts) — this queue only
 * sends public comment replies + private "reply to comment" DMs for
 * EngagementRule matches, never touches post scheduling/publishing.
 */

import { Queue } from "bullmq";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL env var is required");
}

const connection = { url: process.env.REDIS_URL };

export const engagementQueue = new Queue("engagement-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100, age: 24 * 3600 },
    removeOnFail: { count: 200, age: 7 * 24 * 3600 },
  },
});

export interface EngagementJobPayload {
  engagementLogId: string;
}

export async function enqueueEngagementJob(engagementLogId: string): Promise<void> {
  await engagementQueue.add(
    engagementLogId,
    { engagementLogId } satisfies EngagementJobPayload,
    { jobId: engagementLogId }
  );
}
