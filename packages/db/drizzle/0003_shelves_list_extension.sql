CREATE TYPE "public"."shelf_kind" AS ENUM('system', 'custom', 'list');--> statement-breakpoint
CREATE TYPE "public"."shelf_author_type" AS ENUM('user', 'internal_editorial', 'algorithmic');--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "kind" "shelf_kind" NOT NULL DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "author_type" "shelf_author_type" NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "curator_tier" integer;--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "published_at" timestamp with time zone;
