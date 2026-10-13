INSERT INTO "model_prices" ("provider", "model", "input_micros_per_million", "output_micros_per_million", "effective_from") VALUES
  ('groq', 'openai/gpt-oss-20b', 75000, 300000, '2026-01-01 00:00:00+00'),
  ('groq', 'openai/gpt-oss-120b', 150000, 600000, '2026-01-01 00:00:00+00'),
  ('gemini', 'gemini-3.6-flash', 750000, 3750000, '2026-01-01 00:00:00+00'),
  ('gemini', 'gemini-3.6-flash', 1500000, 7500000, '2027-01-01 00:00:00+00')
ON CONFLICT ("provider", "model", "effective_from") DO NOTHING;
