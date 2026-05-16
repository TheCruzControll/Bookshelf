-- F-06 (#72) — back-fill Open Library work id on books.
-- Nullable: books first seen via Google Books have no OL work id until an
-- OL result later surfaces for the same ISBN-13. Unique index treats NULLs
-- as distinct so multiple GB-only books can coexist with NULL ol_work_id.
ALTER TABLE "books" ADD COLUMN "ol_work_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "books_ol_work_id_idx" ON "books" ("ol_work_id");
