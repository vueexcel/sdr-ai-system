/*
  Warnings:

  - A unique constraint covering the columns `[linkedin_url]` on the table `prospects` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."prospects_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "prospects_linkedin_url_key" ON "public"."prospects"("linkedin_url");
