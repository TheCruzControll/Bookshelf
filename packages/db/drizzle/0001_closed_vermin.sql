ALTER TABLE "activity_events" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "activity_events" ALTER COLUMN "visibility" SET DEFAULT 'followers'::text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DEFAULT 'public'::text;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "visibility" SET DEFAULT 'public'::text;--> statement-breakpoint
ALTER TABLE "shelves" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "shelves" ALTER COLUMN "visibility" SET DEFAULT 'public'::text;--> statement-breakpoint
UPDATE "activity_events" SET "visibility" = 'mutuals' WHERE "visibility" = 'friends';--> statement-breakpoint
UPDATE "profiles" SET "default_visibility" = 'mutuals' WHERE "default_visibility" = 'friends';--> statement-breakpoint
UPDATE "reviews" SET "visibility" = 'mutuals' WHERE "visibility" = 'friends';--> statement-breakpoint
UPDATE "shelves" SET "visibility" = 'mutuals' WHERE "visibility" = 'friends';--> statement-breakpoint
DROP TYPE "public"."visibility";--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'followers', 'mutuals', 'private');--> statement-breakpoint
ALTER TABLE "activity_events" ALTER COLUMN "visibility" SET DEFAULT 'followers'::"public"."visibility";--> statement-breakpoint
ALTER TABLE "activity_events" ALTER COLUMN "visibility" SET DATA TYPE "public"."visibility" USING "visibility"::"public"."visibility";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DEFAULT 'public'::"public"."visibility";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "default_visibility" SET DATA TYPE "public"."visibility" USING "default_visibility"::"public"."visibility";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "visibility" SET DEFAULT 'public'::"public"."visibility";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "visibility" SET DATA TYPE "public"."visibility" USING "visibility"::"public"."visibility";--> statement-breakpoint
ALTER TABLE "shelves" ALTER COLUMN "visibility" SET DEFAULT 'public'::"public"."visibility";--> statement-breakpoint
ALTER TABLE "shelves" ALTER COLUMN "visibility" SET DATA TYPE "public"."visibility" USING "visibility"::"public"."visibility";