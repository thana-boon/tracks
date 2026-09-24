ALTER TABLE "track_choices" ADD COLUMN "student_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "change_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "changes_open" boolean DEFAULT true NOT NULL;