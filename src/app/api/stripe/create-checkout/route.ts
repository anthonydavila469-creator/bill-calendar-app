/**
 * Stripe Checkout Session API
 *
 * Creates a Stripe Checkout session for upgrading to Pro tier.
 * Flow:
 * 1. User clicks "Upgrade to Pro" button
 * 2. Frontend calls this API with priceId and plan (monthly/yearly)
 * 3. Creates or retrieves Stripe customer for user
 * 4. Creates checkout session with selected price
 * 5. Returns Stripe Checkout URL to redirect user
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

    // Parse request body
    const { priceId, plan } = await request.json()

    // Validate input
    if (!priceId || !plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid parameters. Expected priceId and plan (monthly or yearly)' },
        { status: 400 }
      )
    }

    // Get user preferences to check for existing Stripe customer
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('stripe_customer_id, email')
      .eq('user_id', user.id)
      .single()

    if (prefsError) {
      console.error('Failed to fetch user preferences:', prefsError)
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      )
    }

    let customerId = prefs?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: prefs?.email || user.email,
        metadata: {
          supabaseUserId: user.id,
        },
      })
      customerId = customer.id

      // Save customer ID to database
      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Failed to save Stripe customer ID:', updateError)
        // Continue anyway - customer is created in Stripe
      }
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

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/settings?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        plan,
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Collect billing address for tax calculation
      billing_address_collection: 'auto',
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    console.error('Checkout session creation error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
