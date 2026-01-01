-- Bill Calendar App Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  recurrence TEXT NOT NULL DEFAULT 'monthly' CHECK (recurrence IN ('monthly', 'weekly', 'yearly', 'once')),
  category TEXT NOT NULL DEFAULT 'Other',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  amount_paid DECIMAL(10, 2) NOT NULL,
  notes TEXT
);

-- Row Level Security (RLS) - Users can only see their own data
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Bills policies
CREATE POLICY "Users can view their own bills"
  ON bills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bills"
  ON bills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bills"
  ON bills FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bills"
  ON bills FOR DELETE
  USING (auth.uid() = user_id);

-- Payments policies
CREATE POLICY "Users can view payments for their bills"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = payments.bill_id
      AND bills.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert payments for their bills"
  ON payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = payments.bill_id
      AND bills.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update payments for their bills"
  ON payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = payments.bill_id
      AND bills.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete payments for their bills"
  ON payments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM bills
      WHERE bills.id = payments.bill_id
      AND bills.user_id = auth.uid()
    )
  );

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_day ON bills(due_day);
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
