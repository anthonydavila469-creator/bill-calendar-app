/**
 * Stripe Customer Portal API
 *
 * Creates a Stripe Customer Portal session for managing subscriptions.
 * The portal allows users to:
 * - Update payment methods
 * - Cancel subscriptions
 * - View invoice history
 * - Download receipts
 *
 * Only accessible to users with an active Stripe customer ID.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe-server'

export async function POST() {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Stripe customer ID
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (prefsError) {
      console.error('Failed to fetch user preferences:', prefsError)
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      )
    }

    if (!prefs?.stripe_customer_id) {
      return NextResponse.json(
        {
          error: 'No active subscription',
          message: 'You need to subscribe before accessing the customer portal.',
        },
        { status: 400 }
      )
    }

    // Validate environment variables
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      console.error('NEXT_PUBLIC_APP_URL is not configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: prefs.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Portal session creation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create portal session',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
