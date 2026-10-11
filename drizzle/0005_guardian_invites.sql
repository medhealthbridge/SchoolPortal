CREATE TABLE "guardian_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"relationship" text DEFAULT 'parent' NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_invites_student_idx" ON "guardian_invites" USING btree ("school_id","student_id");