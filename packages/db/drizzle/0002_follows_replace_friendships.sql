DROP TABLE "friendships";--> statement-breakpoint
ALTER TABLE "follows" DROP CONSTRAINT "follows_pkey";--> statement-breakpoint
ALTER TABLE "follows" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id");--> statement-breakpoint
CREATE INDEX "follows_follower_idx" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");
