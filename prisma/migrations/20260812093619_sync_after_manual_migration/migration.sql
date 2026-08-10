-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_current_tag_id_fkey";

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_current_tag_id_fkey" FOREIGN KEY ("current_tag_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
