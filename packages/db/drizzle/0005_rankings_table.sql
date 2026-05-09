CREATE TABLE "rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"bucket" smallint NOT NULL,
	"locked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rankings_profile_book_idx" ON "rankings" USING btree ("profile_id","book_id");--> statement-breakpoint
CREATE INDEX "rankings_profile_position_idx" ON "rankings" USING btree ("profile_id","position");
