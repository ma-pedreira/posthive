-- CreateTable
CREATE TABLE "EngagementRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'partial',
    "targetMode" TEXT NOT NULL DEFAULT 'any',
    "targetMediaId" TEXT,
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publicReplyText" TEXT,
    "dmText" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "commenterUsername" TEXT,
    "commentText" TEXT NOT NULL,
    "publicReplySentAt" TIMESTAMP(3),
    "dmStatus" TEXT NOT NULL DEFAULT 'pending',
    "dmError" TEXT,
    "source" TEXT NOT NULL DEFAULT 'webhook',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementLog_commentId_key" ON "EngagementLog"("commentId");

-- CreateIndex
CREATE INDEX "EngagementRule_accountId_idx" ON "EngagementRule"("accountId");

-- CreateIndex
CREATE INDEX "EngagementRule_workspaceId_idx" ON "EngagementRule"("workspaceId");

-- CreateIndex
CREATE INDEX "EngagementLog_ruleId_idx" ON "EngagementLog"("ruleId");

-- AddForeignKey
ALTER TABLE "EngagementRule" ADD CONSTRAINT "EngagementRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementRule" ADD CONSTRAINT "EngagementRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementRule" ADD CONSTRAINT "EngagementRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementLog" ADD CONSTRAINT "EngagementLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EngagementRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "EngagementRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EngagementLog"  ENABLE ROW LEVEL SECURITY;
