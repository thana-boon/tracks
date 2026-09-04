ALTER TABLE "track_options" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "phase" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "admission_note" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_options" ADD CONSTRAINT "track_options_group_id_track_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."track_groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracks" ADD CONSTRAINT "tracks_group_id_track_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."track_groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
