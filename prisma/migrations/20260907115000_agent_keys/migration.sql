-- R2-3: per-agent API keys (spec: docs/R2-3-closed-loop-contract-v1.md §7)
CREATE TABLE "agent_keys" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "agent_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_keys_keyHash_key" ON "agent_keys"("keyHash");
CREATE INDEX "agent_keys_agentId_idx" ON "agent_keys"("agentId");
