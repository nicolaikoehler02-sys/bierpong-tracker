CREATE TABLE "camera_control" (
	"id" text PRIMARY KEY NOT NULL,
	"status" jsonb,
	"settings" jsonb,
	"preview" text,
	"preview_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"viewer_seen_at" timestamp with time zone,
	"remote_settings" jsonb,
	"remote_version" bigint DEFAULT 0 NOT NULL,
	"command" jsonb
);
--> statement-breakpoint
ALTER TABLE "drill_blocks" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;