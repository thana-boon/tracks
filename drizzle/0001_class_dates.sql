-- Class scheduling moves from repeating weekdays to explicit calendar dates:
-- a วิชาเสริม runs on a handful of named days, picked on the assignment screen.
-- Also records the room a subject meets in, shown on the check-in list.

ALTER TABLE "track_subjects" ADD COLUMN IF NOT EXISTS "room" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subject_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"year_id" integer NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_dates" ADD CONSTRAINT "subject_dates_subject_id_track_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."track_subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_dates" ADD CONSTRAINT "subject_dates_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_dates_uq" ON "subject_dates" USING btree ("subject_id","year_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_dates_year_date_idx" ON "subject_dates" USING btree ("year_id","date");--> statement-breakpoint

-- Carry over anything already checked: every date that has attendance becomes a
-- scheduled date, so existing results keep evaluating the same way.
INSERT INTO "subject_dates" ("subject_id", "year_id", "date")
SELECT DISTINCT "subject_id", "year_id", "date" FROM "attendance"
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE IF EXISTS "subject_days";
