-- Role-free authorization migration
-- IMPORTANT: back up the database before running this migration.

ALTER TABLE "projects" ADD COLUMN "owner_id" UUID;

UPDATE "projects"
SET "owner_id" = COALESCE("created_by", "lead_id")
WHERE "owner_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "projects" WHERE "owner_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot make projects.owner_id required: some projects have neither created_by nor lead_id';
  END IF;
END $$;

ALTER TABLE "projects" ALTER COLUMN "owner_id" SET NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

ALTER TABLE "users" DROP COLUMN "is_super_admin";
ALTER TABLE "users" DROP COLUMN "is_admin";
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_lead_id_fkey";
ALTER TABLE "projects" DROP COLUMN "lead_id";

DROP TABLE IF EXISTS "project_managers";
DROP TABLE IF EXISTS "tag_managers";
