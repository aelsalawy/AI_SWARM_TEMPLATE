-- CreateTable
CREATE TABLE "agent_chats" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_chats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_chats_agentId_idx" ON "agent_chats"("agentId");

-- CreateIndex
CREATE INDEX "agent_chats_userId_idx" ON "agent_chats"("userId");

-- CreateIndex
CREATE INDEX "agent_chats_agentId_createdAt_idx" ON "agent_chats"("agentId", "createdAt");
