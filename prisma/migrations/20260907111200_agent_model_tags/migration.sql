-- R2-5: persist add-agent enhancement fields (model alias + skills/capability tags)
ALTER TABLE "agents" ADD COLUMN "model" TEXT;
ALTER TABLE "agents" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
