CREATE TABLE IF NOT EXISTS "schedule_block_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_block_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"label" text NOT NULL,
	"source" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_id" integer NOT NULL,
	"semester" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "track_subjects" ADD COLUMN "institution" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_block_days" ADD CONSTRAINT "schedule_block_days_block_id_schedule_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."schedule_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_block_rows" ADD CONSTRAINT "schedule_block_rows_block_id_schedule_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."schedule_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_block_days_uq" ON "schedule_block_days" USING btree ("block_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_block_rows_uq" ON "schedule_block_rows" USING btree ("block_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_blocks_name_uq" ON "schedule_blocks" USING btree ("year_id","semester","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_blocks_term_idx" ON "schedule_blocks" USING btree ("year_id","semester");