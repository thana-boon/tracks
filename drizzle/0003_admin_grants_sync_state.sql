CREATE TABLE IF NOT EXISTS "admin_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"note" text,
	"granted_by" text NOT NULL,
	"granted_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_state" (
	"kind" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"ok" boolean NOT NULL,
	"message" text,
	"detail" jsonb,
	"duration_ms" integer,
	"ran_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_grants_person_uq" ON "admin_grants" USING btree ("person_id");