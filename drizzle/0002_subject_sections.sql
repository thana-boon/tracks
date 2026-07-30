-- รอบเรียน: the same วิชา runs more than once in a year — different กลุ่ม,
-- different room, different days. Everything that varies between runnings moves
-- off the subject and onto a section.
--
-- Existing data becomes one section per (subject, year), named "รอบที่ 1",
-- carrying the room that used to sit on the subject. Schedules, registrations
-- and attendance are re-pointed at it, so nothing changes for anyone until a
-- second section is created.

CREATE TABLE IF NOT EXISTS "subject_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"year_id" integer NOT NULL,
	"name" text NOT NULL,
	"room" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_sections" ADD CONSTRAINT "subject_sections_subject_id_track_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."track_subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_sections" ADD CONSTRAINT "subject_sections_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_sections_uq" ON "subject_sections" USING btree ("subject_id","year_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_sections_year_idx" ON "subject_sections" USING btree ("year_id","subject_id");--> statement-breakpoint

-- One section per (subject, year) that already has any data of its own.
INSERT INTO "subject_sections" ("subject_id", "year_id", "name", "room")
SELECT src."subject_id", src."year_id", 'รอบที่ 1', ts."room"
FROM (
	SELECT "subject_id", "year_id" FROM "subject_dates"
	UNION
	SELECT "subject_id", "year_id" FROM "registrations"
	UNION
	SELECT "subject_id", "year_id" FROM "attendance"
) src
JOIN "track_subjects" ts ON ts."id" = src."subject_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- subject_dates: re-point at the section, then drop the old keys.
ALTER TABLE "subject_dates" ADD COLUMN IF NOT EXISTS "section_id" integer;--> statement-breakpoint
UPDATE "subject_dates" d SET "section_id" = sec."id"
FROM "subject_sections" sec
WHERE sec."subject_id" = d."subject_id" AND sec."year_id" = d."year_id";--> statement-breakpoint
DELETE FROM "subject_dates" WHERE "section_id" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "subject_dates_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "subject_dates_year_date_idx";--> statement-breakpoint
ALTER TABLE "subject_dates" DROP COLUMN IF EXISTS "subject_id";--> statement-breakpoint
ALTER TABLE "subject_dates" DROP COLUMN IF EXISTS "year_id";--> statement-breakpoint
ALTER TABLE "subject_dates" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_dates" ADD CONSTRAINT "subject_dates_section_id_subject_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."subject_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_dates_uq" ON "subject_dates" USING btree ("section_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_dates_date_idx" ON "subject_dates" USING btree ("date");--> statement-breakpoint

-- registrations: keep subject_id/year_id (transcripts group by subject), add section.
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "section_id" integer;--> statement-breakpoint
UPDATE "registrations" r SET "section_id" = sec."id"
FROM "subject_sections" sec
WHERE sec."subject_id" = r."subject_id" AND sec."year_id" = r."year_id";--> statement-breakpoint
DELETE FROM "registrations" WHERE "section_id" IS NULL;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_section_id_subject_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."subject_sections"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registrations_section_idx" ON "registrations" USING btree ("section_id");--> statement-breakpoint

-- attendance: same, and the uniqueness moves to the section so two sections of
-- one subject can meet on the same date.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "section_id" integer;--> statement-breakpoint
UPDATE "attendance" a SET "section_id" = sec."id"
FROM "subject_sections" sec
WHERE sec."subject_id" = a."subject_id" AND sec."year_id" = a."year_id";--> statement-breakpoint
DELETE FROM "attendance" WHERE "section_id" IS NULL;--> statement-breakpoint
ALTER TABLE "attendance" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_section_id_subject_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."subject_sections"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "attendance_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_uq" ON "attendance" USING btree ("section_id","date","slot","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_section_idx" ON "attendance" USING btree ("section_id");--> statement-breakpoint

-- The room now belongs to the section.
ALTER TABLE "track_subjects" DROP COLUMN IF EXISTS "room";
