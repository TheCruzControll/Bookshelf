-- #154: retain blocks placed AGAINST a deleted user against the user's
-- hashed E.164 phone. The row must carry the original blocker so a
-- re-signup with the same number re-applies the block per-blocker.
ALTER TABLE "blocks_against_hash" DROP CONSTRAINT IF EXISTS "blocks_against_hash_pkey";--> statement-breakpoint
ALTER TABLE "blocks_against_hash" ADD COLUMN "blocker_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks_against_hash" ADD CONSTRAINT "blocks_against_hash_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_against_hash_blocker_hash_idx" ON "blocks_against_hash" USING btree ("blocker_id","hash");--> statement-breakpoint
CREATE INDEX "blocks_against_hash_hash_idx" ON "blocks_against_hash" USING btree ("hash");
