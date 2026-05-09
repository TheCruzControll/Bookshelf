CREATE TYPE "public"."notification_platform" AS ENUM('apns', 'fcm');--> statement-breakpoint
CREATE TABLE "notification_tokens" (
	"profile_id" uuid NOT NULL,
	"platform" "notification_platform" NOT NULL,
	"token" text NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"profile_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_tokens_profile_platform_token_idx" ON "notification_tokens" USING btree ("profile_id","platform","token");--> statement-breakpoint
CREATE INDEX "notification_tokens_profile_idx" ON "notification_tokens" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_profile_key_idx" ON "notification_settings" USING btree ("profile_id","key");--> statement-breakpoint
CREATE INDEX "notification_settings_profile_idx" ON "notification_settings" USING btree ("profile_id");
