ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" DROP DEFAULT;--> statement-breakpoint
UPDATE "profiles" SET "default_visibility" = '{"identity":"public","follower_list":"public","review":"public","score":"public","finished_shelf":"public","custom_shelf":"public","want_to_read_shelf":"followers","reading_shelf":"followers","dropped_shelf":"followers","reading_status":"followers","activity_stream":"followers"}';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DATA TYPE jsonb USING "default_visibility"::jsonb;
