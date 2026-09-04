/**
 * Engagement reconcile cron — runs every 15 minutes.
 *
 * Safety net for the Instagram comment webhook: some comments never fire a
 * webhook (collapsed "load more" replies, low-signal accounts, content
 * Instagram itself filters). This sweeps recent comments on each enabled
 * EngagementRule's target post(s) and enqueues any keyword match the webhook
 * missed — reusing the same EngagementLog dedupe-by-commentId as the webhook
 * path, so nothing gets actioned twice.
 *
 * Entirely separate from the post-jobs / stats / cleanup crons.
 */

import cron from "node-cron";
import type { EngagementRule, Account } from "@prisma/client";
import { prisma } from "./prisma.js";
import { matchesKeyword } from "./keywordMatcher.js";
import { enqueueEngagementJob } from "./engagementQueue.js";
import { getCredentials, getRecentMedia, getMediaComments } from "../adapters/instagram.js";

const LOOKBACK_HOURS = 72;
const MAX_NEW_PER_SWEEP = 30;

async function sweepRule(rule: EngagementRule & { account: Account }): Promise<void> {
  const creds = getCredentials(rule.account);
  const cutoff = Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000;

  const mediaIds = rule.targetMode === "specific" && rule.targetMediaId
    ? [rule.targetMediaId]
    : (await getRecentMedia(creds.accessToken, creds.userId, 10)).map((m) => m.id);

  let actioned = 0;
  for (const mediaId of mediaIds) {
    if (actioned >= MAX_NEW_PER_SWEEP) break;
    let comments;
    try {
      comments = await getMediaComments(creds.accessToken, mediaId);
    } catch (err) {
      console.error(`[engagement-cron] failed fetching comments for media ${mediaId}:`, err);
      continue;
    }

    for (const comment of comments) {
      if (actioned >= MAX_NEW_PER_SWEEP) break;
      if (comment.timestamp && new Date(comment.timestamp).getTime() < cutoff) continue;
      if (!matchesKeyword(comment.text, rule.keyword, rule.matchType as "partial" | "whole_word")) continue;

      try {
        const log = await prisma.engagementLog.create({
          data: {
            ruleId: rule.id,
            commentId: comment.id,
            commenterUsername: comment.username ?? null,
            commentText: comment.text,
            dmStatus: "pending",
            source: "polling",
          },
        });
        await enqueueEngagementJob(log.id);
        actioned++;
        console.log(`[engagement-cron] polling matched rule "${rule.name}" for comment ${comment.id}`);
      } catch {
        // Unique constraint on commentId — already handled (webhook or a previous sweep).
      }
    }
  }
}

async function runSweep(): Promise<void> {
  const rules = await prisma.engagementRule.findMany({
    where: { enabled: true },
    include: { account: true },
  });

  let synced = 0;
  let failed = 0;
  for (const rule of rules) {
    try {
      await sweepRule(rule);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[engagement-cron] sweep failed for rule "${rule.name}":`, err);
    }
  }
  console.log(`[engagement-cron] sweep done — ${synced} rule(s) checked, ${failed} failed`);
}

export function runEngagementReconcileNow(): Promise<void> {
  return runSweep();
}

export function startEngagementReconcileCron(): void {
  cron.schedule("*/15 * * * *", () => {
    runSweep().catch((e) => console.error("[engagement-cron] error:", e));
  });
  console.log("[engagement-cron] started — sweeping every 15min");
}
