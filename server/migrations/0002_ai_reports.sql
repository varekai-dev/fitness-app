-- Answers from the app's AI features a user flagged as offensive or harmful.
CREATE TABLE ai_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which feature answered: day_review, meal_advice, macro_tips, program_plan.
  feature TEXT NOT NULL,
  -- The flagged answer as the app showed it, JSON.
  content TEXT NOT NULL,
  app_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_reports_created ON ai_reports(created_at);
