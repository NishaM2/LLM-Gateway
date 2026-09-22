CREATE TYPE "public"."request_status" AS ENUM('ok', 'error', 'fallback');--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_requested" text NOT NULL,
	"status" "request_status" NOT NULL
);
