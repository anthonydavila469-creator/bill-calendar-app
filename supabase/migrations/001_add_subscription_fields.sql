-- Migration: Add subscription fields to user_preferences table
-- Created: 2026-01-02
-- Description: Adds Stripe subscription management fields for Free/Pro tier monetization

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- Add subscription-related columns to user_preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'pro')),
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT NULL
  CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing') OR subscription_status IS NULL),
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bills_limit INTEGER DEFAULT 10;

-- Create unique indexes for Stripe IDs (prevent duplicate customers/subscriptions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_stripe_customer_id
  ON user_preferences(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_stripe_subscription_id
  ON user_preferences(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Create index for faster subscription tier queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_subscription_tier
  ON user_preferences(subscription_tier);

-- Add comment to document the schema change
COMMENT ON COLUMN user_preferences.subscription_tier IS 'User subscription tier: free (10 bills limit) or pro (unlimited)';
COMMENT ON COLUMN user_preferences.subscription_status IS 'Stripe subscription status: active, past_due, canceled, trialing';
COMMENT ON COLUMN user_preferences.stripe_customer_id IS 'Stripe customer ID for billing management';
COMMENT ON COLUMN user_preferences.stripe_subscription_id IS 'Stripe subscription ID for active subscription';
COMMENT ON COLUMN user_preferences.subscription_current_period_end IS 'When current subscription period ends (renewal date)';
COMMENT ON COLUMN user_preferences.bills_limit IS 'Maximum number of active bills allowed (NULL = unlimited for Pro tier)';

-- ============================================================================
-- DOWN MIGRATION (Rollback)
-- ============================================================================
-- Uncomment the lines below to rollback this migration

-- DROP INDEX IF EXISTS idx_user_preferences_stripe_customer_id;
-- DROP INDEX IF EXISTS idx_user_preferences_stripe_subscription_id;
-- DROP INDEX IF EXISTS idx_user_preferences_subscription_tier;

-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS subscription_tier;
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS subscription_status;
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS stripe_customer_id;
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS stripe_subscription_id;
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS subscription_current_period_end;
-- ALTER TABLE user_preferences DROP COLUMN IF EXISTS bills_limit;

-- ============================================================================
-- NOTES FOR EXECUTION
-- ============================================================================
-- Execute this migration in Supabase Dashboard:
-- 1. Go to SQL Editor
-- 2. Paste the UP MIGRATION section
-- 3. Click "Run"
-- 4. Verify with: SELECT * FROM user_preferences LIMIT 1;
--
-- To rollback:
-- 1. Uncomment the DOWN MIGRATION section
-- 2. Run in SQL Editor
-- ============================================================================
