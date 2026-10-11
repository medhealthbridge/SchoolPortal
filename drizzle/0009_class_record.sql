CREATE TYPE "public"."grade_component" AS ENUM('ww', 'pt', 'qa');--> statement-breakpoint
CREATE TABLE "assessment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"raw" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_scores_uq" UNIQUE("assessment_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"component" "grade_component" NOT NULL,
	"title" text NOT NULL,
	"highest_score" double precision NOT NULL,
	"given_on" date,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "grading_group" text DEFAULT 'languages' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grading_period_id_grading_periods_id_fk" FOREIGN KEY ("grading_period_id") REFERENCES "public"."grading_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_class_idx" ON "assessments" USING btree ("school_id","section_id","subject_id","grading_period_id");