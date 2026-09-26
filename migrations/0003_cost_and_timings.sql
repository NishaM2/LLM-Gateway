CREATE TABLE "model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_micros_per_million" integer NOT NULL,
	"output_micros_per_million" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "cost_micros" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ttft_ms" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "model_prices_unique" ON "model_prices" USING btree ("provider","model","effective_from");--> statement-breakpoint
INSERT INTO "model_prices" ("provider", "model", "input_micros_per_million", "output_micros_per_million", "effective_from")
VALUES ('groq', 'openai/gpt-oss-20b', 75000, 300000, '2026-01-01T00:00:00Z');
