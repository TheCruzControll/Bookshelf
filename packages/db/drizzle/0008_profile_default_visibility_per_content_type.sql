ALTER TABLE "profiles" ADD COLUMN "default_visibility_jsonb" jsonb;--> statement-breakpoint
UPDATE "profiles" SET "default_visibility_jsonb" = '{"identity":"public","follower_list":"public","review":"public","score":"public","finished_shelf":"public","custom_shelf":"public","want_to_read_shelf":"followers","reading_shelf":"followers","dropped_shelf":"followers","reading_status":"followers","activity_stream":"followers"}'::jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility_jsonb" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "default_visibility";--> statement-breakpoint
ALTER TABLE "profiles" RENAME COLUMN "default_visibility_jsonb" TO "default_visibility";
