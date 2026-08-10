-- Drop the tag history table — a user's tag is now a plain current-state
-- column, no history is kept.
DROP TABLE IF EXISTS "user_tag_history";

-- Add the current tag directly to users.
ALTER TABLE "users" ADD COLUMN "current_tag_id" UUID;

ALTER TABLE "users"
  ADD CONSTRAINT "users_current_tag_id_fkey"
  FOREIGN KEY ("current_tag_id") REFERENCES "tags"("id")
  ON DELETE SET NULL;

-- Mark which tag is the single "Universal" tag (approved by admins,
-- not a tag manager, for tasks like journaling or meetings).
ALTER TABLE "tags" ADD COLUMN "is_universal" BOOLEAN NOT NULL DEFAULT false;

-- Seed the one Universal tag row. Safe to run even if it already
-- exists (e.g. re-running locally).
INSERT INTO "tags" ("id", "name", "is_universal")
VALUES (gen_random_uuid(), 'Universal', true)
ON CONFLICT ("name") DO NOTHING;

-- Every general task (no project) must carry SOME tag now — either a
-- real skill tag or the Universal tag — since approval always routes
-- through a tag. Safe to add immediately: the tasks table is empty.
ALTER TABLE "tasks" ADD CONSTRAINT "chk_general_task_has_tag"
  CHECK ("project_id" IS NOT NULL OR "tag_id" IS NOT NULL);

-- Make the Universal tag immutable at the DB level: block any UPDATE
-- that changes is_universal/name on it, and block DELETE entirely.
CREATE OR REPLACE FUNCTION protect_universal_tag() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_universal THEN
      RAISE EXCEPTION 'The Universal tag cannot be deleted';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_universal AND (NEW.name <> OLD.name OR NEW.is_universal <> OLD.is_universal) THEN
      RAISE EXCEPTION 'The Universal tag cannot be renamed or un-flagged';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_universal_tag
  BEFORE UPDATE OR DELETE ON "tags"
  FOR EACH ROW EXECUTE FUNCTION protect_universal_tag();
