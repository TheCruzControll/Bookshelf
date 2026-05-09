ALTER TABLE "imports" ADD COLUMN "idempotency_hash" text;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "conflict_count" integer DEFAULT 0 NOT NULL;
