-- Agent Dispatch v1 (docs/agent-trigger-assessment.md §8.2/§8.4):
-- Assignment-triggered agent spawning — PM-mediated dispatch (CEO direction).
-- One row per (agent, item) assignment; carries the PM review lifecycle (pmState)
-- and the assignee spawn lifecycle (wakeState). The unique key is the structural
-- storm guard: re-assigning the same item to the same agent upserts, never double-spawns.
CREATE TABLE "agent_dispatches" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL DEFAULT 'alm',
    "pmState" TEXT NOT NULL DEFAULT 'skipped',
    "pmSessionId" TEXT,
    "pmNotifiedAt" TIMESTAMP(3),
    "pmActedAt" TIMESTAMP(3),
    "pmNudges" INTEGER NOT NULL DEFAULT 0,
    "wakeState" TEXT NOT NULL DEFAULT 'pending',
    "wakeAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastWakeError" TEXT,
    "gatewaySessionId" TEXT,
    "spawnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_dispatches_wakeState_idx" ON "agent_dispatches"("wakeState");

-- CreateIndex
CREATE INDEX "agent_dispatches_pmState_idx" ON "agent_dispatches"("pmState");

-- CreateIndex
CREATE UNIQUE INDEX "agent_dispatches_agentId_itemType_itemId_key" ON "agent_dispatches"("agentId", "itemType", "itemId");
