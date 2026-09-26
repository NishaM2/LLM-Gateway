ALTER TABLE "requests" ALTER COLUMN "model_requested" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "error_code" text;