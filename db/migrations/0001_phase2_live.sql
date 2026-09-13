ALTER TABLE "drill_blocks" ADD COLUMN "camera_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "voided_at" timestamp with time zone;