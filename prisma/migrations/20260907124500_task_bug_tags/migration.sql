-- R2-9: skill tags on Task and Bug (mirror Agent.tags pattern from R2-5)
-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "bugs" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];