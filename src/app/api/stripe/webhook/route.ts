/**
 * Stripe Webhook Handler
 *
 * CRITICAL: This endpoint processes Stripe webhook events to keep subscription
 * status synchronized with the database.
 *
 * Handled Events:
 * - checkout.session.completed: User completes payment → Upgrade to Pro
 * - customer.subscription.updated: Subscription changes → Update status/renewal date
 * - customer.subscription.deleted: User cancels → Downgrade to Free
 * - invoice.payment_failed: Payment fails → Mark as past_due
 *
 * Security:
 * - Verifies webhook signature to prevent spoofing
 * - Only processes events from Stripe's servers
 *
 * Setup:
 * 1. Deploy this endpoint
 * 2. Add webhook in Stripe Dashboard: https://your-domain.com/api/stripe/webhook
 * 3. Copy webhook signing secret to STRIPE_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent } from '@/lib/stripe-server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// IMPORTANT: Disable body parsing for webhook signature verification
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Get raw body and signature
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      console.error('❌ Webhook error: Missing Stripe signature')
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = constructWebhookEvent(body, signature)
    } catch (err: any) {
      console.error('❌ Webhook signature verification failed:', err.message)
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    console.log(`📨 Webhook received: ${event.type}`)

    // Initialize Supabase admin client (bypasses RLS for system operations)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Process webhook event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId

        if (!userId) {
          console.error('⚠️ Checkout completed but no userId in metadata')
          break
        }

        // Upgrade user to Pro tier
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({
            subscription_tier: 'pro',
            subscription_status: 'active',
            stripe_subscription_id: session.subscription as string,
            bills_limit: null, // Unlimited bills for Pro tier
          })
          .eq('user_id', userId)

        if (updateError) {
          console.error('❌ Failed to upgrade user to Pro:', updateError)
        } else {
          console.log(`✅ User ${userId} upgraded to Pro`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by Stripe customer ID
        const { data: prefs, error: findError } = await supabase
          .from('user_preferences')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (findError || !prefs) {
          console.error('⚠️ Subscription updated but customer not found:', customerId)
          break
        }

        // Update subscription status and renewal date
        // @ts-ignore - Stripe types issue with current_period_end
        const periodEnd = subscription.current_period_end
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({
            subscription_status: subscription.status,
            subscription_current_period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          })
          .eq('user_id', prefs.user_id)

        if (updateError) {
          console.error('❌ Failed to update subscription status:', updateError)
        } else {
          console.log(
            `✅ Subscription updated for user ${prefs.user_id}: ${subscription.status}`
          )
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by Stripe customer ID
        const { data: prefs, error: findError } = await supabase
          .from('user_preferences')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (findError || !prefs) {
          console.error('⚠️ Subscription deleted but customer not found:', customerId)
          break
        }

        // Downgrade user to Free tier
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            bills_limit: 10, // Free tier limit
            stripe_subscription_id: null,
          })
          .eq('user_id', prefs.user_id)

        if (updateError) {
          console.error('❌ Failed to downgrade user to Free:', updateError)
        } else {
          console.log(`⬇️ User ${prefs.user_id} downgraded to Free tier`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by Stripe customer ID
        const { data: prefs, error: findError } = await supabase
          .from('user_preferences')
          .select('user_id, email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (findError || !prefs) {
          console.error('⚠️ Payment failed but customer not found:', customerId)
          break
        }

        // Mark subscription as past_due
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({ subscription_status: 'past_due' })
          .eq('user_id', prefs.user_id)

        if (updateError) {
          console.error('❌ Failed to update subscription to past_due:', updateError)
        } else {
          console.log(`⚠️ Payment failed for user ${prefs.user_id}`)
          // TODO: Send email notification using Resend
          // Could integrate with existing reminder system in src/lib/resend.ts
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by Stripe customer ID
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (prefs) {
          // If payment succeeded and subscription was past_due, reactivate it
          const { error: updateError } = await supabase
            .from('user_preferences')
            .update({ subscription_status: 'active' })
            .eq('user_id', prefs.user_id)
            .eq('subscription_status', 'past_due')

          if (!updateError) {
            console.log(`✅ Payment succeeded, subscription reactivated for user ${prefs.user_id}`)
          }
        }
        break
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`)
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error)
    // Still return 200 to prevent Stripe from retrying
    return NextResponse.json({ error: error.message }, { status: 200 })
  }
}
