CREATE TYPE "public"."cache_status" AS ENUM('hit', 'miss', 'skip');--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "cache_status" "cache_status";