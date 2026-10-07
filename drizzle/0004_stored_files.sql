CREATE TABLE "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;