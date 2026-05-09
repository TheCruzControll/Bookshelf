CREATE TABLE "contacts_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"contact_hash" text NOT NULL,
	"salt_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"salt_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts_index" ADD CONSTRAINT "contacts_index_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_index" ADD CONSTRAINT "email_index_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_index_profile_id_idx" ON "contacts_index" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "contacts_index_hash_salt_idx" ON "contacts_index" USING btree ("contact_hash","salt_version");--> statement-breakpoint
CREATE INDEX "email_index_profile_id_idx" ON "email_index" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "email_index_hash_salt_idx" ON "email_index" USING btree ("email_hash","salt_version");
