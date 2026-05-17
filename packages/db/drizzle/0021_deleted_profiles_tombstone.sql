CREATE TABLE "deleted_profiles_tombstone" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deleted_profiles_tombstone_handle_idx" ON "deleted_profiles_tombstone" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "deleted_profiles_tombstone_expires_at_idx" ON "deleted_profiles_tombstone" USING btree ("expires_at");
