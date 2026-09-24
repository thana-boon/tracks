ALTER TABLE "admin_grants" ADD COLUMN "role" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "track_groups" ADD COLUMN "color" text;