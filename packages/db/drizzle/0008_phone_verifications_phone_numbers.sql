CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"profile_id" uuid NOT NULL,
	"e164_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_verifications_phone_idx" ON "phone_verifications" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "phone_verifications_expires_idx" ON "phone_verifications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_profile_idx" ON "phone_numbers" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_hash_idx" ON "phone_numbers" USING btree ("e164_hash");
