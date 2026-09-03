ALTER TABLE "track_subjects" ADD COLUMN "semester" integer;--> statement-breakpoint
ALTER TABLE "track_subjects" ADD COLUMN "phase" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_subjects_phase_idx" ON "track_subjects" USING btree ("semester","phase");