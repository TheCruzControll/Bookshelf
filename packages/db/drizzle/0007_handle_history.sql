CREATE TABLE "handle_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"old_handle" text NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handle_history" ADD CONSTRAINT "handle_history_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "handle_history_old_handle_idx" ON "handle_history" USING btree ("old_handle");
--> statement-breakpoint
CREATE INDEX "handle_history_profile_idx" ON "handle_history" USING btree ("profile_id");
