CREATE TABLE IF NOT EXISTS "document_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"school_name" text NOT NULL,
	"document_title" text NOT NULL,
	"document_subtitle" text,
	"logo" text,
	"director_name" text,
	"director_title" text NOT NULL,
	"director_signature" text,
	"registrar_name" text,
	"registrar_title" text NOT NULL,
	"registrar_signature" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
