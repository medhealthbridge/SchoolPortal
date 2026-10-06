ALTER TABLE "schools" ADD COLUMN "database_name" text;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_database_name_unique" UNIQUE("database_name");