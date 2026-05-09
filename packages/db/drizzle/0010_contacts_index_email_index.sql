CREATE TABLE "contacts_index" (
	"profile_id" uuid NOT NULL,
	"contact_hash" text NOT NULL,
	"salt_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_index" (
	"profile_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"salt_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts_index" ADD CONSTRAINT "contacts_index_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_index" ADD CONSTRAINT "email_index_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_index_profile_hash_idx" ON "contacts_index" USING btree ("profile_id","contact_hash");--> statement-breakpoint
CREATE INDEX "contacts_index_profile_idx" ON "contacts_index" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "contacts_index_expires_at_idx" ON "contacts_index" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_index_profile_hash_idx" ON "email_index" USING btree ("profile_id","email_hash");--> statement-breakpoint
CREATE INDEX "email_index_profile_idx" ON "email_index" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "email_index_expires_at_idx" ON "email_index" USING btree ("expires_at");
