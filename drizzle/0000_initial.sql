CREATE TYPE "public"."activity_kind" AS ENUM('sao_event', 'ministry');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'monitoring', 'closed');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('reported', 'under_review', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."offense_severity" AS ENUM('minor', 'major', 'grave');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('enrollment', 'transfer_out', 'certificate', 'transcript');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('requested', 'on_hold', 'cleared', 'released', 'declined');--> statement-breakpoint
CREATE TYPE "public"."role_key" AS ENUM('school_admin', 'principal', 'registrar', 'teacher', 'adviser', 'discipline_officer', 'guidance_counselor', 'sao_staff', 'chaplain', 'accounting', 'parent', 'student');--> statement-breakpoint
CREATE TYPE "public"."sanction_kind" AS ENUM('warning', 'community_service', 'detention', 'suspension', 'referral');--> statement-breakpoint
CREATE TYPE "public"."school_status" AS ENUM('trial', 'active', 'past_due', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."school_type" AS ENUM('k12', 'senior_high', 'college');--> statement-breakpoint
CREATE TYPE "public"."tier_key" AS ENUM('starter', 'academic', 'student_life', 'all_in');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"name" text NOT NULL,
	"on_date" date NOT NULL,
	"location" text,
	"service_hours" integer DEFAULT 0 NOT NULL,
	"organized_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"section_id" uuid,
	"posted_by_user_id" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"at_time" time NOT NULL,
	"note" text,
	"attended" boolean
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text,
	"marked_by_user_id" uuid NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_slot_student_date_uq" UNIQUE("slot_id","student_id","on_date")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "club_memberships_uq" UNIQUE("club_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"moderator_user_id" uuid,
	CONSTRAINT "clubs_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_uq" UNIQUE("student_id","school_year_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_centavos" integer NOT NULL,
	"level" text,
	"due_on" date,
	CONSTRAINT "fee_items_uq" UNIQUE("school_year_id","name","level")
);
--> statement-breakpoint
CREATE TABLE "grading_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" smallint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "grading_periods_uq" UNIQUE("school_year_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "guidance_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'walk_in' NOT NULL,
	"opened_by_user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"offense_level_id" uuid,
	"on_date" date NOT NULL,
	"summary" text NOT NULL,
	"status" "incident_status" DEFAULT 'reported' NOT NULL,
	"reported_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role_key" NOT NULL,
	"token" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"period" text NOT NULL,
	"student_count" integer NOT NULL,
	"platform_fee_centavos" integer NOT NULL,
	"student_fee_centavos" integer NOT NULL,
	"total_centavos" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"due_on" date NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_school_period_uq" UNIQUE("school_id","period")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"channel" text DEFAULT 'inapp' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offense_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"severity" "offense_severity" DEFAULT 'minor' NOT NULL,
	"description" text,
	CONSTRAINT "offense_levels_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"channel" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount_centavos" integer NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"recorded_by_admin_id" uuid,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "registrar_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "request_kind" NOT NULL,
	"status" "request_status" DEFAULT 'requested' NOT NULL,
	"purpose" text,
	"hold_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"handled_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" text NOT NULL,
	"rows" smallint DEFAULT 5 NOT NULL,
	"cols" smallint DEFAULT 6 NOT NULL,
	CONSTRAINT "rooms_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"kind" "sanction_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"note" text,
	"issued_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_modules" (
	"school_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	CONSTRAINT "school_modules_school_id_module_key_pk" PRIMARY KEY("school_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	CONSTRAINT "school_years_uq" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdomain" text NOT NULL,
	"name" text NOT NULL,
	"type" "school_type" DEFAULT 'k12' NOT NULL,
	"status" "school_status" DEFAULT 'trial' NOT NULL,
	"tier" "tier_key" DEFAULT 'starter' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#2F557F' NOT NULL,
	"accent_color" text DEFAULT '#FFA92D' NOT NULL,
	"owner_name" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_mobile" text,
	"email_verified_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"onboarding_step" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"remarks" text,
	"entered_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_uq" UNIQUE("grading_period_id","student_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "seat_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_plans_uq" UNIQUE("section_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"branch_id" uuid,
	"school_year_id" uuid NOT NULL,
	"level" text NOT NULL,
	"name" text NOT NULL,
	"adviser_user_id" uuid,
	CONSTRAINT "sections_uq" UNIQUE("school_year_id","level","name")
);
--> statement-breakpoint
CREATE TABLE "service_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"hours" integer NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_hours_uq" UNIQUE("activity_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"user_id" uuid,
	"platform_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_item_id" uuid NOT NULL,
	"amount_centavos" integer NOT NULL,
	"charged_on" date NOT NULL,
	CONSTRAINT "student_charges_uq" UNIQUE("student_id","fee_item_id")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"relationship" text DEFAULT 'parent' NOT NULL,
	CONSTRAINT "student_guardians_uq" UNIQUE("student_id","guardian_user_id")
);
--> statement-breakpoint
CREATE TABLE "student_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount_centavos" integer NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"receipt_no" text NOT NULL,
	"received_by_user_id" uuid,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"branch_id" uuid,
	"student_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"activation_code" text NOT NULL,
	"parent_code" text NOT NULL,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_school_number_uq" UNIQUE("school_id","student_number")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "subjects_uq" UNIQUE("school_id","code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"tier" "tier_key" NOT NULL,
	"extra_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform_fee_centavos" integer NOT NULL,
	"per_student_centavos" integer DEFAULT 2000 NOT NULL,
	"started_on" date NOT NULL,
	"ends_on" date
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"room_id" uuid,
	"weekday" smallint NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role_key" NOT NULL,
	"branch_id" uuid,
	CONSTRAINT "user_roles_uq" UNIQUE("user_id","role","branch_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text,
	"phone" text,
	"name" text NOT NULL,
	"password_hash" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"mfa_secret" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_school_email_uq" UNIQUE("school_id","email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organized_by_user_id_users_id_fk" FOREIGN KEY ("organized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_guidance_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."guidance_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_slot_id_timetable_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_users_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_guidance_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."guidance_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_cases" ADD CONSTRAINT "guidance_cases_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_cases" ADD CONSTRAINT "guidance_cases_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_cases" ADD CONSTRAINT "guidance_cases_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_offense_level_id_offense_levels_id_fk" FOREIGN KEY ("offense_level_id") REFERENCES "public"."offense_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offense_levels" ADD CONSTRAINT "offense_levels_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_admin_id_platform_admins_id_fk" FOREIGN KEY ("recorded_by_admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrar_requests" ADD CONSTRAINT "registrar_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrar_requests" ADD CONSTRAINT "registrar_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrar_requests" ADD CONSTRAINT "registrar_requests_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_modules" ADD CONSTRAINT "school_modules_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_grading_period_id_grading_periods_id_fk" FOREIGN KEY ("grading_period_id") REFERENCES "public"."grading_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_adviser_user_id_users_id_fk" FOREIGN KEY ("adviser_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_platform_admin_id_platform_admins_id_fk" FOREIGN KEY ("platform_admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_charges" ADD CONSTRAINT "student_charges_fee_item_id_fee_items_id_fk" FOREIGN KEY ("fee_item_id") REFERENCES "public"."fee_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_idx" ON "activities" USING btree ("school_id","kind","on_date");--> statement-breakpoint
CREATE INDEX "announcements_school_idx" ON "announcements" USING btree ("school_id","posted_at");--> statement-breakpoint
CREATE INDEX "attendance_school_date_idx" ON "attendance_records" USING btree ("school_id","on_date");--> statement-breakpoint
CREATE INDEX "audit_school_at_idx" ON "audit_log" USING btree ("school_id","at");--> statement-breakpoint
CREATE INDEX "events_unprocessed_idx" ON "events" USING btree ("school_id","processed_at");--> statement-breakpoint
CREATE INDEX "guidance_cases_idx" ON "guidance_cases" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "incidents_student_idx" ON "incidents" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "outbound_school_idx" ON "outbound_messages" USING btree ("school_id","sent_at");--> statement-breakpoint
CREATE INDEX "registrar_requests_idx" ON "registrar_requests" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "schools_status_idx" ON "schools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scores_student_idx" ON "scores" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_school_idx" ON "students" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "timetable_teacher_idx" ON "timetable_slots" USING btree ("teacher_user_id","weekday");--> statement-breakpoint
CREATE INDEX "users_school_idx" ON "users" USING btree ("school_id");