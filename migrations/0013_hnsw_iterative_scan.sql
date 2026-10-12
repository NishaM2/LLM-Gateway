DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET hnsw.iterative_scan = strict_order', current_database());
END
$$;
