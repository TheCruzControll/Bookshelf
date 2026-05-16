ALTER TABLE "contacts_index" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "contacts_index_disabled_at_idx" ON "contacts_index" USING btree ("disabled_at");
