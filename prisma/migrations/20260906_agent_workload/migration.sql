-- P2-2: Agent workload dashboard fields
-- currentTaskId: task currently assigned to the agent (set by /api/agents/:id/assign/:taskId)
-- lastHeartbeat: last check-in time (updated on status updates / heartbeats)
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "currentTaskId" TEXT;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "lastHeartbeat" TIMESTAMP(3);