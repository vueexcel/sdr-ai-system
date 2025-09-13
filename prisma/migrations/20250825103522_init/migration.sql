-- CreateEnum
CREATE TYPE "public"."ProspectStatus" AS ENUM ('NEW', 'CONNECTION_SENT', 'CONNECTED', 'MESSAGED', 'RESPONDED', 'QUALIFIED', 'MEETING_BOOKED', 'CLOSED', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "public"."CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."prospects" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "apollo_contact_id" TEXT,
    "status" "public"."ProspectStatus" NOT NULL DEFAULT 'NEW',
    "linkedin_connected" BOOLEAN NOT NULL DEFAULT false,
    "connection_date" TIMESTAMP(3),
    "first_message_sent" TIMESTAMP(3),
    "last_interaction" TIMESTAMP(3),
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "conversation_history" JSONB NOT NULL DEFAULT '[]',
    "meeting_scheduled" TIMESTAMP(3),
    "meeting_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "organization_id" INTEGER,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "employees_count" INTEGER,
    "location" TEXT,
    "linkedin_url" TEXT,
    "website_url" TEXT,
    "revenue" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."campaigns" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "daily_limit" INTEGER NOT NULL DEFAULT 25,
    "message_template" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospects_email_key" ON "public"."prospects"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_domain_key" ON "public"."organizations"("domain");

-- AddForeignKey
ALTER TABLE "public"."prospects" ADD CONSTRAINT "prospects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
