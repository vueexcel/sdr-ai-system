/*
  Warnings:

  - A unique constraint covering the columns `[apollo_contact_id]` on the table `prospects` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "prospects_apollo_contact_id_key" ON "public"."prospects"("apollo_contact_id");
