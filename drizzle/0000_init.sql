CREATE TYPE "public"."attendance_slot" AS ENUM('morning', 'afternoon');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('student', 'teacher');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"schoolos_id" integer NOT NULL,
	"year" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_schoolos_id_unique" UNIQUE("schoolos_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"date" date NOT NULL,
	"slot" "attendance_slot" NOT NULL,
	"present" boolean NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classroom_students" (
	"id" serial PRIMARY KEY NOT NULL,
	"classroom_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homerooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"grade_level" text NOT NULL,
	"classroom" text NOT NULL,
	"teacher_id" integer NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "person_type" NOT NULL,
	"schoolos_id" integer NOT NULL,
	"code" text NOT NULL,
	"prefix" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"gender" text,
	"grade_level" text,
	"classroom" text,
	"class_number" integer,
	"schoolos_role" text,
	"status" text DEFAULT 'studying' NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" text NOT NULL,
	"dropped_at" timestamp,
	"dropped_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"year_id" integer NOT NULL,
	"day_of_week" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "track_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"teacher_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_subject_id_track_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."track_subjects"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_people_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_student_id_people_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homerooms" ADD CONSTRAINT "homerooms_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homerooms" ADD CONSTRAINT "homerooms_teacher_id_people_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_subject_id_track_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."track_subjects"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_student_id_people_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_days" ADD CONSTRAINT "subject_days_subject_id_track_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."track_subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_days" ADD CONSTRAINT "subject_days_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_subjects" ADD CONSTRAINT "track_subjects_group_id_track_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."track_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_uq" ON "attendance" USING btree ("subject_id","date","slot","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_subject_year_idx" ON "attendance" USING btree ("subject_id","year_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_student_idx" ON "attendance" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "classroom_students_uq" ON "classroom_students" USING btree ("classroom_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classroom_students_student_idx" ON "classroom_students" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "classrooms_year_name_uq" ON "classrooms" USING btree ("year_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "homerooms_uq" ON "homerooms" USING btree ("year_id","grade_level","classroom","teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homerooms_teacher_idx" ON "homerooms" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "people_type_schoolos_id_uq" ON "people" USING btree ("type","schoolos_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_type_code_idx" ON "people" USING btree ("type","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_grade_room_idx" ON "people" USING btree ("grade_level","classroom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registrations_year_subject_idx" ON "registrations" USING btree ("year_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registrations_student_idx" ON "registrations" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_days_uq" ON "subject_days" USING btree ("subject_id","year_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_subjects_code_uq" ON "track_subjects" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_subjects_group_idx" ON "track_subjects" USING btree ("group_id");