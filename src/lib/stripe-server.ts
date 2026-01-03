/**
 * Stripe Server Instance
 *
 * Initializes the Stripe SDK for server-side operations.
 * This instance is used in API routes for:
 * - Creating checkout sessions
 * - Managing customer portal sessions
 * - Handling webhook events
 * - Accessing subscription data
 *
 * IMPORTANT: Only use this in server-side code (API routes, server components).
 * Never import this in client components as it exposes the secret key.
 */

import Stripe from 'stripe'

// Validate that the secret key is configured at runtime
// Allow placeholder during build time
if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'production') {
  console.warn(
    'Missing STRIPE_SECRET_KEY environment variable. ' +
    'Add it to your .env.local file. ' +
    'Get your key from: https://dashboard.stripe.com/apikeys'
  )
}

/**
 * Stripe instance configured with the latest API version
 * Uses the secret key for server-side operations
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  // Use the latest API version
  // Update this version as needed when Stripe releases new versions
  apiVersion: '2025-12-15.clover',

  // Enable TypeScript support for better type safety
  typescript: true,

  // App info for Stripe's analytics (optional but recommended)
  appInfo: {
    name: 'PayPulse Bill Calendar',
    version: '1.0.0',
  },
})

/**
 * Helper function to verify webhook signatures
 * Used in the webhook route to ensure requests are from Stripe
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      'Missing STRIPE_WEBHOOK_SECRET environment variable. ' +
      'Create a webhook endpoint in Stripe Dashboard and copy the signing secret.'
    )
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  )
}
