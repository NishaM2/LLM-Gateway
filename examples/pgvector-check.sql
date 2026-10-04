SELECT extversion AS pgvector_version FROM pg_extension WHERE extname = 'vector';

\d cache_entries

CREATE TEMP TABLE demo (label text, v vector(3));
INSERT INTO demo VALUES ('cat', '[1, 0, 0]'), ('kitten', '[0.9, 0.1, 0]'), ('car', '[0, 0, 1]');

SELECT label, v <=> '[1, 0, 0]' AS distance FROM demo ORDER BY distance;

INSERT INTO cache_entries (namespace, prompt, embedding, response, model, expires_at)
VALUES ('test', 'hi', '[1, 0, 0]', '{}', 'test', now());
