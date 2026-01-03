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

    // Get the origin from the request headers (works in both dev and production)
    const origin = request.headers.get('origin') || request.headers.get('referer')?.split('/').slice(0, 3).join('/') || process.env.NEXT_PUBLIC_APP_URL || 'https://bill-calendar-app.vercel.app'

    const returnUrl = `${origin}/settings`
    console.log('Creating portal session with return URL:', returnUrl)

    // Log customer ID for debugging
    console.log('Creating portal session for customer:', prefs.stripe_customer_id)

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: prefs.stripe_customer_id,
      return_url: returnUrl,
    })

    console.log('Portal session created successfully:', session.id)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    // Enhanced error logging
    console.error('Portal session creation error (full):', {
      message: error?.message,
      type: error?.type,
      code: error?.code,
      statusCode: error?.statusCode,
      raw: error?.raw,
      customerId: prefs?.stripe_customer_id,
      stack: error?.stack,
    })

    return NextResponse.json(
      {
        error: 'Failed to create portal session',
        details: error?.message || 'Unknown error',
        errorType: error?.type,
        errorCode: error?.code,
        customerId: prefs?.stripe_customer_id, // Include for debugging
      },
      { status: 500 }
    )
  }
}
