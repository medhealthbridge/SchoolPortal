ALTER TABLE "schools" ADD COLUMN "privacy_notice" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "privacy_officer" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "privacy_notice_version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_consent_version" smallint;