CREATE TABLE "enrolment_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"grade_level" text NOT NULL,
	"learner" jsonb NOT NULL,
	"previous_school" text,
	"guardian_name" text NOT NULL,
	"guardian_relationship" text,
	"guardian_phone" text NOT NULL,
	"guardian_email" text,
	"privacy_consent_at" timestamp with time zone NOT NULL,
	"decision_note" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolment_applications_ref_uq" UNIQUE("school_id","reference")
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "enrolment_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "enrolment_applications" ADD CONSTRAINT "enrolment_applications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment_applications" ADD CONSTRAINT "enrolment_applications_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment_applications" ADD CONSTRAINT "enrolment_applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrolment_applications_status_idx" ON "enrolment_applications" USING btree ("school_id","status");