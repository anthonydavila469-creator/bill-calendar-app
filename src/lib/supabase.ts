import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Database types for TypeScript
export type Bill = {
  id: string
  user_id: string
  name: string
  amount: number
  due_day: number
  recurrence: 'monthly' | 'weekly' | 'yearly' | 'once'
  category: string
  notes: string | null
  created_at: string
  is_active: boolean
  google_event_id?: string | null
}

export type UserPreferences = {
  id: string
  user_id: string
  reminder_enabled: boolean
  reminder_days: number[]
  gmail_sync_enabled: boolean
  google_access_token: string | null
  google_refresh_token: string | null
  google_token_expiry: string | null
  google_calendar_id: string
  last_gmail_sync: string | null
  email: string | null
  created_at: string
  updated_at: string
  // Subscription fields
  subscription_tier: 'free' | 'pro'
  subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_current_period_end: string | null
  bills_limit: number | null
}

export type SyncedEmail = {
  id: string
  user_id: string
  email_id: string
  email_subject: string | null
  email_from: string | null
  bill_id: string | null
  processed_at: string
}

export type Payment = {
  id: string
  bill_id: string
  paid_at: string
  amount_paid: number
  notes: string | null
}

export type BillWithPayments = Bill & {
  payments: Payment[]
}

// Bill categories for AI categorization
export const BILL_CATEGORIES = [
  'Utilities',
  'Subscriptions',
  'Insurance',
  'Housing',
  'Transportation',
  'Healthcare',
  'Credit Cards',
  'Food & Dining',
  'Entertainment',
  'Other'
] as const

export type BillCategory = typeof BILL_CATEGORIES[number]
