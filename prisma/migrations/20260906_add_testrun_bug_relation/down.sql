-- Rollback: Remove Test-Run ↔ Bug junction table and Bug detail fields

-- DropForeignKey
ALTER TABLE "test_run_bugs" DROP CONSTRAINT "test_run_bugs_testRunId_fkey";
ALTER TABLE "test_run_bugs" DROP CONSTRAINT "test_run_bugs_bugId_fkey";

-- DropTable
DROP TABLE "test_run_bugs";

-- AlterTable: Remove bug detail fields
ALTER TABLE "bugs" DROP COLUMN "severity";
ALTER TABLE "bugs" DROP COLUMN "stepsToReproduce";
ALTER TABLE "bugs" DROP COLUMN "expectedBehavior";
ALTER TABLE "bugs" DROP COLUMN "actualBehavior";
ALTER TABLE "bugs" DROP COLUMN "environment";