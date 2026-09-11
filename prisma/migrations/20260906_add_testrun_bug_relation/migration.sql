-- CreateTable: Test-Run ↔ Bug junction table
CREATE TABLE "test_run_bugs" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_run_bugs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_run_bugs_testRunId_idx" ON "test_run_bugs"("testRunId");
CREATE INDEX "test_run_bugs_bugId_idx" ON "test_run_bugs"("bugId");

-- CreateIndex: Unique constraint to prevent duplicate links
CREATE UNIQUE INDEX "test_run_bugs_testRunId_bugId_key" ON "test_run_bugs"("testRunId", "bugId");

-- AddForeignKey: TestRunBug → TestRun
ALTER TABLE "test_run_bugs" ADD CONSTRAINT "test_run_bugs_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TestRunBug → Bug
ALTER TABLE "test_run_bugs" ADD CONSTRAINT "test_run_bugs_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add bug detail fields to Bug model
ALTER TABLE "bugs" ADD COLUMN "severity" TEXT;
ALTER TABLE "bugs" ADD COLUMN "stepsToReproduce" TEXT;
ALTER TABLE "bugs" ADD COLUMN "expectedBehavior" TEXT;
ALTER TABLE "bugs" ADD COLUMN "actualBehavior" TEXT;
ALTER TABLE "bugs" ADD COLUMN "environment" TEXT;