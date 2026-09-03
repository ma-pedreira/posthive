/**
 * BullMQ worker — processes post-jobs queue.
 *
 * When BullMQ fires a job, the worker:
 *   1. Loads the full PostJob + targets from Prisma
 *   2. Hands it to the existing runJob() state machine
 *
 * Per-target errors are handled inside runJob() and don't throw up to the
 * worker. On a network-level failure (not a platform rejection), the target
 * schedules its own 5-minute-delayed re-fire of this postJobId (up to 3
 * attempts total) instead of failing immediately — see jobRunner.ts. That
 * re-fire lands here with the job still in "running" status, which is why
 * the guard below allows both "pending" and "running" through.
 */

import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { prisma } from "./prisma.js";
import { type PostJobPayload } from "./queue.js";
import { runJob } from "../runner/jobRunner.js";
import type { StorageAdapter } from "./storage.js";

const connection = { url: process.env.REDIS_URL! };

export function startWorker(storage: StorageAdapter): void {
  const worker = new Worker<PostJobPayload>(
    "post-jobs",
    async (job) => {
      const { postJobId } = job.data;

      const postJob = await prisma.postJob.findUnique({
        where: { id: postJobId },
        include: { targets: { include: { account: true } } },
      });

      if (!postJob) {
        // Job was deleted before it fired — nothing to do
        console.warn(`[worker] PostJob ${postJobId} not found in DB — skipping`);
        return;
      }

      if (postJob.status !== "pending" && postJob.status !== "running") {
        // Already finished (done/failed) or a duplicate fire — skip.
        // "running" is allowed through: a target-level network-error retry
        // re-fires this same postJobId while the job is still in progress.
        console.warn(`[worker] PostJob ${postJobId} status is "${postJob.status}" — skipping`);
        return;
      }

      console.log(`[worker] processing PostJob ${postJobId}`);
      await runJob(postJob, storage);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.data.postJobId} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.data.postJobId} failed:`, err.message);
    Sentry.captureException(err, {
      tags: { component: "worker" },
      extra: { postJobId: job?.data.postJobId },
    });
  });

  console.log("[worker] started — waiting for jobs");
}
