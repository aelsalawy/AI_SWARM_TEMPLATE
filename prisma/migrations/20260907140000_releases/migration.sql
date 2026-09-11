-- R3: per-project release registry (admin Sprints & Releases view + release dropdowns)
-- Release stays a free string on tasks/bugs/requirements (backward compat);
-- this table only powers the admin view and dropdown suggestions.
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "releases_projectId_name_key" ON "releases"("projectId", "name");
CREATE INDEX "releases_projectId_idx" ON "releases"("projectId");

ALTER TABLE "releases" ADD CONSTRAINT "releases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
