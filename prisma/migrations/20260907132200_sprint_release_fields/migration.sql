-- R2-F1: sprint + release fields on Task/Bug/Requirement
ALTER TABLE "tasks"    ADD COLUMN "sprintId" TEXT, ADD COLUMN "release" TEXT;
ALTER TABLE "bugs"     ADD COLUMN "sprintId" TEXT, ADD COLUMN "release" TEXT;
ALTER TABLE "requirements" ADD COLUMN "sprintId" TEXT, ADD COLUMN "release" TEXT;
CREATE INDEX "tasks_sprintId_idx"        ON "tasks"("sprintId");
CREATE INDEX "bugs_sprintId_idx"         ON "bugs"("sprintId");
CREATE INDEX "requirements_sprintId_idx" ON "requirements"("sprintId");
