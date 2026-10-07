ALTER TYPE "public"."cache_status" ADD VALUE 'semantic_hit';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "semantic_similarity" real;--> statement-breakpoint
CREATE INDEX "cache_entries_namespace_idx" ON "cache_entries" USING btree ("namespace");--> statement-breakpoint
CREATE INDEX "cache_entries_embedding_idx" ON "cache_entries" USING hnsw ("embedding" vector_cosine_ops);