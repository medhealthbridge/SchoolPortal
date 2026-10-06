ALTER TABLE "students" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "suffix" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "lrn" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "place_of_birth" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "mother_tongue" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "religion" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "ip_group" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "four_ps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "disability" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "psa_birth_cert_no" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_lrn_uq" UNIQUE("school_id","lrn");