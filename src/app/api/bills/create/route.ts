/**
 * Centralized Bill Creation API
 *
 * This endpoint handles ALL bill creation operations and enforces subscription limits.
 * Used by:
 * - Add Bill Modal (manual bill entry)
 * - Gmail Sync (auto-detected bills from emails)
 * - Future integrations (CSV import, API, etc.)
 *
 * Free Tier Limits:
 * - Maximum 10 active bills
 * - Returns 403 with upgradeRequired flag when limit reached
 *
 * Pro Tier:
 * - Unlimited bills (bills_limit = null)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { BILL_CATEGORIES } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const billData = await request.json()

    // Validate required fields
    if (!billData.name || !billData.amount || !billData.due_day) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'Bill must have: name, amount, and due_day',
        },
        { status: 400 }
      )
    }

    // Validate amount
    const amount = parseFloat(billData.amount)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount', message: 'Amount must be greater than 0' },
        { status: 400 }
      )
    }

    // Validate due_day
    const dueDay = parseInt(billData.due_day)
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      return NextResponse.json(
        { error: 'Invalid due day', message: 'Due day must be between 1 and 31' },
        { status: 400 }
      )
    }

    // Validate category
    const category = billData.category || 'Other'
    if (!BILL_CATEGORIES.includes(category as any)) {
      return NextResponse.json(
        {
          error: 'Invalid category',
          message: `Category must be one of: ${BILL_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // CHECK SUBSCRIPTION LIMITS
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('subscription_tier, bills_limit')
      .eq('user_id', user.id)
      .single()

    if (prefsError) {
      console.error('Failed to fetch user preferences:', prefsError)
      // Continue with default free tier if preferences not found
    }

    // Count active bills for this user
    const { count: billCount, error: countError } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (countError) {
      console.error('Failed to count bills:', countError)
      return NextResponse.json(
        { error: 'Failed to verify bill limit' },
        { status: 500 }
      )
    }

    // Enforce bill limit for Free tier
    const billsLimit = prefs?.bills_limit ?? 10 // Default to 10 if not set
    if (billsLimit !== null && billCount !== null && billCount >= billsLimit) {
      const tier = prefs?.subscription_tier || 'free'
      return NextResponse.json(
        {
          error: 'Bill limit reached',
          message: `Your ${tier} plan allows up to ${billsLimit} active bills. You currently have ${billCount}. Upgrade to Pro for unlimited bills!`,
          upgradeRequired: true,
          currentCount: billCount,
          limit: billsLimit,
          tier,
        },
        { status: 403 }
      )
    }

    // Create bill
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .insert({
        user_id: user.id,
        name: billData.name,
        amount: amount,
        due_day: dueDay,
        recurrence: billData.recurrence || 'monthly',
        category: category,
        notes: billData.notes || null,
        is_active: true,
        google_event_id: billData.google_event_id || null,
      })
      .select()
      .single()

    if (billError) {
      console.error('Bill creation error:', billError)
      return NextResponse.json(
        { error: 'Failed to create bill', details: billError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        bill,
        message: 'Bill created successfully',
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Bill creation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create bill',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
