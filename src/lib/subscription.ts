/**
 * Subscription Tiers & Feature Flags
 *
 * Defines the Free and Pro tier configurations, limits, and feature access controls.
 * Used throughout the app to enforce subscription-based limits and conditionally
 * render features based on user's subscription tier.
 */

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    billsLimit: 10,
    gmailSyncLimit: 50, // emails per month
    features: [
      'Up to 10 bills tracked',
      'Gmail sync (50 emails/month)',
      'Basic email reminders',
      'Calendar view',
      'Manual bill entry',
    ],
    restrictions: [
      'No AI categorization (keyword matching only)',
      'No spending analytics',
      'No export features',
    ],
  },
  pro: {
    name: 'Pro',
    priceMonthly: 4.99,
    priceYearly: 49,
    yearlyDiscount: 0.17, // 17% savings
    billsLimit: null, // unlimited
    gmailSyncLimit: null, // unlimited
    features: [
      'Unlimited bills',
      'Unlimited Gmail sync',
      'AI-powered categorization',
      'Advanced reminders (1, 3, 7, 14 days)',
      'Spending analytics & charts',
      'Export to CSV/PDF',
      'Priority support',
      'Multi-device sync',
    ],
  },
} as const

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS

/**
 * Get the maximum number of bills allowed for a tier
 * @param tier - Subscription tier (free or pro)
 * @returns Maximum bills limit (null = unlimited for Pro)
 */
export function getBillsLimit(tier: SubscriptionTier): number | null {
  return SUBSCRIPTION_TIERS[tier].billsLimit
}

/**
 * Check if a tier has access to AI categorization
 * @param tier - Subscription tier (free or pro)
 * @returns true if AI categorization is available
 */
export function canAccessAI(tier: SubscriptionTier): boolean {
  return tier === 'pro'
}

/**
 * Check if a tier has access to spending analytics
 * @param tier - Subscription tier (free or pro)
 * @returns true if analytics/charts are available
 */
export function canAccessAnalytics(tier: SubscriptionTier): boolean {
  return tier === 'pro'
}

/**
 * Check if a tier has access to advanced reminder options
 * @param tier - Subscription tier (free or pro)
 * @returns true if advanced reminders (multi-day options) are available
 */
export function canAccessAdvancedReminders(tier: SubscriptionTier): boolean {
  return tier === 'pro'
}

/**
 * Check if a tier has access to export features (CSV/PDF)
 * @param tier - Subscription tier (free or pro)
 * @returns true if export is available
 */
export function canExport(tier: SubscriptionTier): boolean {
  return tier === 'pro'
}

/**
 * Get the Gmail sync limit for a tier
 * @param tier - Subscription tier (free or pro)
 * @returns Maximum emails to sync per month (null = unlimited for Pro)
 */
export function getGmailSyncLimit(tier: SubscriptionTier): number | null {
  return SUBSCRIPTION_TIERS[tier].gmailSyncLimit
}

/**
 * Check if a user has exceeded their bills limit
 * @param currentCount - Current number of active bills
 * @param tier - Subscription tier (free or pro)
 * @returns true if user has reached their limit
 */
export function hasReachedBillsLimit(
  currentCount: number,
  tier: SubscriptionTier
): boolean {
  const limit = getBillsLimit(tier)
  if (limit === null) return false // Pro tier has no limit
  return currentCount >= limit
}

/**
 * Calculate savings percentage for yearly vs monthly billing
 * @returns Savings percentage (0.17 = 17%)
 */
export function getYearlySavings(): number {
  const monthlyTotal = SUBSCRIPTION_TIERS.pro.priceMonthly * 12
  const yearlySaving = monthlyTotal - SUBSCRIPTION_TIERS.pro.priceYearly
  return yearlySaving / monthlyTotal
}

/**
 * Get formatted price string for display
 * @param tier - Subscription tier
 * @param interval - Billing interval (monthly or yearly)
 * @returns Formatted price string (e.g., "$4.99/month")
 */
export function getFormattedPrice(
  tier: SubscriptionTier,
  interval: 'monthly' | 'yearly' = 'monthly'
): string {
  if (tier === 'free') return 'Free'

  if (interval === 'yearly') {
    return `$${SUBSCRIPTION_TIERS.pro.priceYearly}/year`
  }

  return `$${SUBSCRIPTION_TIERS.pro.priceMonthly}/month`
}
