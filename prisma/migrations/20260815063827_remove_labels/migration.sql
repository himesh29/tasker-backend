/*
  Warnings:

  - You are about to drop the column `tag_id` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the column `current_tag_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `labels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_labels` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "tags_created_by_fkey";

-- DropForeignKey
ALTER TABLE "task_labels" DROP CONSTRAINT "task_labels_label_id_fkey";

-- DropForeignKey
ALTER TABLE "task_labels" DROP CONSTRAINT "task_labels_task_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_current_tag_id_fkey";

-- DropIndex
DROP INDEX "projects_owner_id_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "tag_id",
ADD COLUMN     "tag" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "current_tag_id";

-- DropTable
DROP TABLE "labels";

-- DropTable
DROP TABLE "tags";

-- DropTable
DROP TABLE "task_labels";
