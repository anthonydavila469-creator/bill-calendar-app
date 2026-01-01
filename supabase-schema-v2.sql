-- Gmail Auto-Sync & Email Reminders Schema Update
-- Run this in Supabase SQL Editor

-- User preferences for reminders and sync
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_days INTEGER[] DEFAULT '{1, 3, 7}',  -- Days before due date to send reminders
  gmail_sync_enabled BOOLEAN DEFAULT false,
  google_access_token TEXT,     -- Google OAuth access token
  google_refresh_token TEXT,    -- Google OAuth refresh token
  google_token_expiry TIMESTAMP WITH TIME ZONE,
  google_calendar_id TEXT DEFAULT 'primary',  -- Selected calendar for syncing
  last_gmail_sync TIMESTAMP WITH TIME ZONE,
  email TEXT,  -- User's email for sending reminders
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track synced emails to avoid duplicates
CREATE TABLE IF NOT EXISTS synced_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id TEXT NOT NULL,  -- Gmail message ID
  email_subject TEXT,
  email_from TEXT,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, email_id)
);

-- Add google_event_id to bills for calendar sync (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'google_event_id'
  ) THEN
    ALTER TABLE bills ADD COLUMN google_event_id TEXT;
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for synced_emails
DROP POLICY IF EXISTS "Users can view own synced emails" ON synced_emails;
CREATE POLICY "Users can view own synced emails" ON synced_emails
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own synced emails" ON synced_emails;
CREATE POLICY "Users can insert own synced emails" ON synced_emails
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own synced emails" ON synced_emails;
CREATE POLICY "Users can delete own synced emails" ON synced_emails
  FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger for user_preferences
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_synced_emails_user_id ON synced_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_synced_emails_email_id ON synced_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
