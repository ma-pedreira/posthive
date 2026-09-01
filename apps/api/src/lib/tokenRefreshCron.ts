/**
 * Background cron — proactively refreshes tokens expiring within 7 days.
 * Runs every 12 hours. Covers Threads, Instagram, Facebook, YouTube, TikTok.
 * LinkedIn has no silent refresh — users must reconnect manually.
 * Sends expiry warning emails for LinkedIn accounts expiring within 7 days.
 */

import * as Sentry from "@sentry/node";
import { prisma } from "./prisma.js";
import { getAdapter } from "../adapters/index.js";
import { sendAccountExpiryEmail } from "./mailer.js";

const REFRESH_PLATFORMS = new Set(["threads", "instagram", "facebook", "youtube", "tiktok"]);
const WARN_PLATFORMS = new Set(["linkedin"]); // no refresh token — warn user to reconnect
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INTERVAL_MS = 12 * 60 * 60 * 1000;    // 12 hours
const BATCH_SIZE = 50;
const BATCH_CONCURRENCY = 5; // refresh 5 accounts at a time within each batch

async function run() {
  const cutoff = new Date(Date.now() + WINDOW_MS);

  // ── Token refresh (platforms that support silent refresh) ──
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.account.findMany({
      where: {
        platform: { in: Array.from(REFRESH_PLATFORMS) },
        expiresAt: { lte: cutoff },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;

    for (let i = 0; i < batch.length; i += BATCH_CONCURRENCY) {
      const chunk = batch.slice(i, i + BATCH_CONCURRENCY);
      await Promise.allSettled(
        chunk.map(async (account) => {
          try {
            const adapter = getAdapter(account.platform);
            const refreshed = await adapter.refreshTokenIfNeeded(account);
            if (refreshed.updatedAt !== account.updatedAt) {
              console.log(`[token-refresh] refreshed ${account.platform} account ${account.displayName}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[token-refresh] failed for ${account.platform} account ${account.id}:`, err);
            const isRevoked = msg.includes("invalid_grant") || msg.includes("reconnect");
            if (!isRevoked) {
              Sentry.captureException(err, {
                tags: { component: "token-refresh", platform: account.platform },
                extra: { accountId: account.id },
              });
            }
          }
        })
      );
    }

    if (batch.length < BATCH_SIZE) break;
  }

  // ── Expiry warnings (platforms with no refresh token) ──
  const expiringAccounts = await prisma.account.findMany({
    where: {
      platform: { in: Array.from(WARN_PLATFORMS) },
      expiresAt: { gte: new Date(), lte: cutoff },
      warnedExpiryAt: null, // only warn once
    },
    include: { user: { select: { email: true } } },
  });

  for (const account of expiringAccounts) {
    try {
      const daysLeft = account.expiresAt
        ? Math.ceil((account.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : 0;
      const userEmail = (account as typeof account & { user: { email: string } }).user.email;
      await sendAccountExpiryEmail(userEmail, account.platform, account.displayName, daysLeft);
      await prisma.account.update({ where: { id: account.id }, data: { warnedExpiryAt: new Date() } });
      console.log(`[token-refresh] sent expiry warning for ${account.platform} account ${account.displayName}`);
    } catch (err) {
      console.error(`[token-refresh] failed to send expiry warning for ${account.id}:`, err);
    }
  }
}

export function startTokenRefreshCron() {
  // Run once at startup to catch anything already near expiry
  run().catch((e) => console.error("[token-refresh] error:", e));
  setInterval(() => run().catch((e) => console.error("[token-refresh] error:", e)), INTERVAL_MS);
}
