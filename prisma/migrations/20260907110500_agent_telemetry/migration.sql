-- R2-8: per-agent telemetry table (model in schema.prisma since e362cdc)
CREATE TABLE IF NOT EXISTS "agent_telemetry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_telemetry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "agent_telemetry_agentId_idx" ON "agent_telemetry"("agentId");
CREATE INDEX IF NOT EXISTS "agent_telemetry_agentId_createdAt_idx" ON "agent_telemetry"("agentId", "createdAt");
