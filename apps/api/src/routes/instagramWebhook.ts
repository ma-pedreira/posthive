/**
 * Instagram comment webhook — feeds the EngagementRule auto-reply feature.
 *
 * GET  /webhooks/instagram — Meta's one-time subscription verification handshake.
 * POST /webhooks/instagram — comment-created events. Verifies the payload
 *   signature, matches against enabled EngagementRules, and enqueues an
 *   engagement job per matched comment (deduped via EngagementLog.commentId).
 *
 * This is additive: it never touches the post-jobs queue/worker or any
 * existing publishing flow.
 */

import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { matchesKeyword } from "../lib/keywordMatcher.js";
import { enqueueEngagementJob } from "../lib/engagementQueue.js";
import { getCredentials } from "../adapters/instagram.js";

interface CommentChangeValue {
  id: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

interface WebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{ field: string; value: CommentChangeValue }>;
  }>;
}

function verifySignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function handleCommentEvent(igAccountId: string, value: CommentChangeValue): Promise<void> {
  const commentId = value.id;
  const commentText = value.text ?? "";
  const mediaId = value.media?.id;
  if (!commentId || !mediaId) return;

  // Find the connected Instagram Account whose stored professional account id matches.
  const accounts = await prisma.account.findMany({ where: { platform: "instagram" } });
  const account = accounts.find((a) => {
    try { return getCredentials(a).userId === igAccountId; } catch { return false; }
  });
  if (!account) return;

  const rules = await prisma.engagementRule.findMany({
    where: {
      accountId: account.id,
      enabled: true,
      OR: [{ targetMode: "any" }, { targetMode: "specific", targetMediaId: mediaId }],
    },
  });

  const rule = rules.find((r) => matchesKeyword(commentText, r.keyword, r.matchType as "partial" | "whole_word"));
  if (!rule) return;

  try {
    const log = await prisma.engagementLog.create({
      data: {
        ruleId: rule.id,
        commentId,
        commenterUsername: value.from?.username ?? null,
        commentText,
        dmStatus: "pending",
        source: "webhook",
      },
    });
    await enqueueEngagementJob(log.id);
    console.log(`[engagement] webhook matched rule "${rule.name}" for comment ${commentId}`);
  } catch (err) {
    // Unique constraint on commentId — already handled by a previous webhook fire or the reconciler.
    console.warn(`[engagement] comment ${commentId} already logged, skipping:`, (err as Error).message);
  }
}

export async function instagramWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get("/webhooks/instagram", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const mode = q["hub.mode"];
    const token = q["hub.verify_token"];
    const challenge = q["hub.challenge"];

    if (mode === "subscribe" && token && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send("Verification failed");
  });

  app.post("/webhooks/instagram", { config: { rawBody: true } }, async (req, reply) => {
    const secret = process.env.INSTAGRAM_APP_SECRET ?? "";
    if (!secret) {
      console.error("[engagement] INSTAGRAM_APP_SECRET not set — refusing webhook");
      return reply.status(500).send({ error: "Webhook not configured" });
    }

    const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;
    if (!rawBody) {
      console.error("[engagement] rawBody missing — cannot verify webhook signature");
      return reply.status(500).send({ error: "Cannot verify webhook" });
    }
    const bodyString = rawBody.toString();

    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifySignature(bodyString, signature, secret)) {
      console.warn("[engagement] webhook signature verification failed");
      return reply.status(401).send({ error: "Invalid signature" });
    }

    // Ack immediately — Meta expects a fast 200, do the work after.
    reply.status(200).send({ ok: true });

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(bodyString) as WebhookPayload;
    } catch {
      console.error("[engagement] failed to parse webhook payload");
      return;
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") continue;
        await handleCommentEvent(entry.id, change.value).catch((err) =>
          console.error("[engagement] error handling comment event:", err)
        );
      }
    }
  });
}
