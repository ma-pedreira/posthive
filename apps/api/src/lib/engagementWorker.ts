/**
 * BullMQ worker for the engagement-jobs queue (Instagram comment auto-reply).
 *
 * Entirely separate from the post-jobs worker (worker.ts) — a failure or
 * change here cannot affect post scheduling/publishing.
 *
 * Each job looks up an already-created EngagementLog row (created by either
 * the webhook handler or the polling reconciler with dmStatus: "pending"),
 * sends the public reply (if enabled) and the private reply (DM), then
 * records the outcome. Rate-limited to stay under Meta's ~750/hour private
 * reply cap.
 */

import { Worker } from "bullmq";
import { prisma } from "./prisma.js";
import { type EngagementJobPayload } from "./engagementQueue.js";
import { getCredentials, sendCommentReply, sendPrivateReply } from "../adapters/instagram.js";

const connection = { url: process.env.REDIS_URL! };

export function startEngagementWorker(): void {
  const worker = new Worker<EngagementJobPayload>(
    "engagement-jobs",
    async (job) => {
      const { engagementLogId } = job.data;

      const log = await prisma.engagementLog.findUnique({
        where: { id: engagementLogId },
        include: { rule: { include: { account: true } } },
      });

      if (!log) {
        console.warn(`[engagement] log ${engagementLogId} not found — skipping`);
        return;
      }
      if (log.dmStatus === "sent") {
        console.warn(`[engagement] log ${engagementLogId} already sent — skipping`);
        return;
      }

      const { rule } = log;
      const creds = getCredentials(rule.account);

      if (rule.publicReplyEnabled && rule.publicReplyText) {
        try {
          await sendCommentReply(creds.accessToken, log.commentId, rule.publicReplyText);
          await prisma.engagementLog.update({
            where: { id: log.id },
            data: { publicReplySentAt: new Date() },
          });
          console.log(`[engagement] public reply sent for comment ${log.commentId}`);
        } catch (err) {
          console.error(`[engagement] public reply failed for comment ${log.commentId}:`, err);
        }
      }

      try {
        await sendPrivateReply(creds.accessToken, creds.userId, log.commentId, rule.dmText);
        await prisma.engagementLog.update({
          where: { id: log.id },
          data: { dmStatus: "sent", dmError: null },
        });
        console.log(`[engagement] private reply (DM) sent for comment ${log.commentId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.engagementLog.update({
          where: { id: log.id },
          data: { dmStatus: "failed", dmError: message },
        });
        console.error(`[engagement] private reply failed for comment ${log.commentId}:`, message);
        throw err; // let BullMQ retry per defaultJobOptions
      }
    },
    {
      connection,
      concurrency: 3,
      limiter: { max: 700, duration: 60 * 60 * 1000 }, // stay under Meta's ~750/hour private-reply cap
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[engagement] job ${job?.data.engagementLogId} failed:`, err.message);
  });

  console.log("[engagement] worker started — waiting for comment matches");
}
