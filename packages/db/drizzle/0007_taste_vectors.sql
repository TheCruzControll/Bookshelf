CREATE TABLE "taste_vectors" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"vector" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taste_vectors" ADD CONSTRAINT "taste_vectors_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taste_vectors_profile_idx" ON "taste_vectors" USING btree ("profile_id");
