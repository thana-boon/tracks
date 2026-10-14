CREATE TABLE IF NOT EXISTS "track_option_ranks" (
	"id" serial PRIMARY KEY NOT NULL,
	"choice_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"option_id" integer NOT NULL,
	"ranked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "ranking_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "ranking_require_all" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_option_ranks" ADD CONSTRAINT "track_option_ranks_choice_id_track_choices_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."track_choices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_option_ranks" ADD CONSTRAINT "track_option_ranks_option_id_track_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."track_options"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_option_ranks_rank_uq" ON "track_option_ranks" USING btree ("choice_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_option_ranks_option_uq" ON "track_option_ranks" USING btree ("choice_id","option_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_option_ranks_option_idx" ON "track_option_ranks" USING btree ("option_id");