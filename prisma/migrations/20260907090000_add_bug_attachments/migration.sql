-- Add bug attachments table (model was missing from schema; API routes already reference prisma.bugAttachment)
CREATE TABLE "bug_attachments" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageType" TEXT NOT NULL DEFAULT 'base64',
    "data" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bug_attachments_bugId_idx" ON "bug_attachments"("bugId");

ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;