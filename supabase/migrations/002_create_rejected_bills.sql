-- Create rejected_bills table to track why bills were not created during sync
-- This helps users understand why certain emails weren't detected as bills

CREATE TABLE IF NOT EXISTS rejected_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_id TEXT NOT NULL,
  email_subject TEXT,
  email_from TEXT,
  parsed_name TEXT,
  parsed_amount DECIMAL(10, 2),
  parsed_due_day INTEGER,
  parsed_category TEXT,
  confidence INTEGER,
  rejection_reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by user
CREATE INDEX IF NOT EXISTS rejected_bills_user_id_idx ON rejected_bills(user_id);

-- Create index for finding rejected bills by email
CREATE INDEX IF NOT EXISTS rejected_bills_email_id_idx ON rejected_bills(email_id);

-- Enable Row Level Security
ALTER TABLE rejected_bills ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own rejected bills
CREATE POLICY "Users can view their own rejected bills"
  ON rejected_bills
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own rejected bills
CREATE POLICY "Users can delete their own rejected bills"
  ON rejected_bills
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: System can insert rejected bills
CREATE POLICY "System can insert rejected bills"
  ON rejected_bills
  FOR INSERT
  WITH CHECK (true);
