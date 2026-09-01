CREATE TABLE IF NOT EXISTS "track_choices" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"semester" integer NOT NULL,
	"student_id" integer NOT NULL,
	"track_id" integer NOT NULL,
	"option_id" integer,
	"chosen_by" text NOT NULL,
	"chosen_at" timestamp DEFAULT now() NOT NULL,
	"changed_by" text,
	"changed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"semester" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"grade_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_choices" ADD CONSTRAINT "track_choices_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_choices" ADD CONSTRAINT "track_choices_student_id_people_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_choices" ADD CONSTRAINT "track_choices_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_choices" ADD CONSTRAINT "track_choices_option_id_track_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."track_options"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_options" ADD CONSTRAINT "track_options_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracks" ADD CONSTRAINT "tracks_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_choices_term_student_uq" ON "track_choices" USING btree ("year_id","semester","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_choices_track_idx" ON "track_choices" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_choices_student_idx" ON "track_choices" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_options_name_uq" ON "track_options" USING btree ("track_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_options_track_idx" ON "track_options" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracks_term_name_uq" ON "tracks" USING btree ("year_id","semester","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_term_idx" ON "tracks" USING btree ("year_id","semester");