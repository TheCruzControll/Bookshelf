CREATE TABLE "phone_verifications" (
	"phone_e164" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"e164_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_verifications_expires_at_idx" ON "phone_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_e164_hash_idx" ON "phone_numbers" USING btree ("e164_hash");
