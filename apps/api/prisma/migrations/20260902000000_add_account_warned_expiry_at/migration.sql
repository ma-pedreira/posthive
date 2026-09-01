-- Add warnedExpiryAt to Account so the cron only sends expiry warning once
ALTER TABLE "Account" ADD COLUMN "warnedExpiryAt" TIMESTAMP(3);
