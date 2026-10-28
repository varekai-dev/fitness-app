-- Settings the admin page edits: groq_api_key, ai_daily_limit.
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Models the app may call through /ai/chat, with Groq's price in USD per million tokens.
-- A model missing here is refused, so the app can't run up the bill on an expensive one.
CREATE TABLE ai_models (
  model TEXT PRIMARY KEY,
  input_per_m REAL NOT NULL,
  output_per_m REAL NOT NULL
);
-- Prices as of adding them; check console.groq.com/docs/models and fix them on the admin page.
INSERT INTO ai_models (model, input_per_m, output_per_m) VALUES
  ('openai/gpt-oss-120b', 0.15, 0.60),
  ('qwen/qwen3.8-27b', 0, 0);

-- One row per AI request that Groq answered; cost is worked out from ai_models when shown.
CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The JSON schema's name the app asked for (nutrition, day_review…), or `search`.
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_usage_created ON ai_usage(created_at);
CREATE INDEX ai_usage_user ON ai_usage(user_id, created_at);

-- Admin page sign-ins (with Google); like `sessions`, only a hash of the token.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
