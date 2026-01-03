'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Zap, Crown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/design-system'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_TIERS } from '@/lib/subscription'

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)

  async function handleUpgrade(plan: 'monthly' | 'yearly') {
    setLoading(true)
    try {
      const priceId =
        plan === 'monthly'
          ? process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID
          : process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID

      if (!priceId) {
        toast.error('Pricing configuration error. Please contact support.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, plan }),
      })

      const data = await res.json()

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        toast.error(data.error || 'Failed to create checkout session')
        setLoading(false)
      }
    } catch (error) {
      toast.error('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const monthlyPrice = SUBSCRIPTION_TIERS.pro.priceMonthly
  const yearlyPrice = SUBSCRIPTION_TIERS.pro.priceYearly
  const yearlyMonthlyEquivalent = (yearlyPrice / 12).toFixed(2)
  const savingsPercent = Math.round(SUBSCRIPTION_TIERS.pro.yearlyDiscount * 100)

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black px-4 py-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <PageHeader
          title="Choose Your Plan"
          subtitle="Start free, upgrade when you're ready to unlock premium features"
        />

        {/* Billing Toggle */}
        <div className="flex justify-center items-center gap-4">
          <span
            className={cn(
              'text-sm font-medium transition-colors',
              billingInterval === 'monthly' ? 'text-white' : 'text-zinc-500'
            )}
          >
            Monthly
          </span>
          <button
            onClick={() =>
              setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')
            }
            className={cn(
              'relative w-14 h-8 rounded-full transition-all duration-300',
              billingInterval === 'yearly'
                ? 'bg-gradient-to-r from-teal-500 to-cyan-500'
                : 'bg-white/10'
            )}
            aria-label="Toggle billing interval"
          >
            <span
              className={cn(
                'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-lg',
                billingInterval === 'yearly' && 'translate-x-6'
              )}
            />
          </button>
          <span
            className={cn(
              'text-sm font-medium transition-colors',
              billingInterval === 'yearly' ? 'text-white' : 'text-zinc-500'
            )}
          >
            Yearly
            {billingInterval === 'yearly' && (
              <Badge className="ml-2 bg-teal-500/20 text-teal-400 border-teal-500/30 text-xs">
                Save {savingsPercent}%
              </Badge>
            )}
          </span>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Free Tier */}
          <div className="glass-card rounded-2xl p-8 border-white/10 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-zinc-500/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-zinc-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Free</h3>
                <p className="text-sm text-zinc-500">Get started</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-4xl font-bold mb-1">
                $0
                <span className="text-lg text-zinc-500 font-normal">/month</span>
              </div>
              <p className="text-sm text-zinc-500">Forever free</p>
            </div>

            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_TIERS.free.features.map((feature, i) => (
                <Feature key={i} included>
                  {feature}
                </Feature>
              ))}
              {SUBSCRIPTION_TIERS.free.restrictions.map((restriction, i) => (
                <Feature key={`r-${i}`}>{restriction}</Feature>
              ))}
            </ul>

            <Button
              className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
              disabled
            >
              Current Plan
            </Button>
          </div>

          {/* Pro Tier */}
          <div className="glass-card rounded-2xl p-8 border-teal-500/30 relative bg-gradient-to-b from-teal-500/5 to-transparent hover:border-teal-500/50 transition-all">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 shadow-lg shadow-teal-500/50">
              <Crown className="w-4 h-4" />
              Most Popular
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/50">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Pro</h3>
                <p className="text-sm text-zinc-500">For power users</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-4xl font-bold mb-1">
                ${billingInterval === 'monthly' ? monthlyPrice : yearlyPrice}
                <span className="text-lg text-zinc-500 font-normal">
                  /{billingInterval === 'monthly' ? 'month' : 'year'}
                </span>
              </div>
              <p className="text-sm text-zinc-500">
                {billingInterval === 'yearly' && (
                  <>
                    Just ${yearlyMonthlyEquivalent}/month billed annually
                    <Sparkles className="w-4 h-4 inline ml-1 text-teal-400" />
                  </>
                )}
                {billingInterval === 'monthly' && 'Billed monthly'}
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_TIERS.pro.features.map((feature, i) => (
                <Feature key={i} included bold={i < 3}>
                  {feature}
                </Feature>
              ))}
            </ul>

            <Button
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold shadow-lg shadow-teal-500/50 transition-all hover:shadow-teal-500/70 hover:scale-[1.02] active:scale-95"
              onClick={() => handleUpgrade(billingInterval)}
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                <>
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </>
              )}
            </Button>
          </div>
        </div>

        {/* FAQ or Additional Info */}
        <div className="glass-card rounded-2xl p-8 max-w-3xl mx-auto text-center">
          <h3 className="text-xl font-bold mb-4">Frequently Asked Questions</h3>
          <div className="space-y-4 text-left">
            <div>
              <p className="font-medium text-white mb-1">Can I cancel anytime?</p>
              <p className="text-sm text-zinc-400">
                Yes! You can cancel your subscription at any time from your account settings. No questions asked.
              </p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">What happens to my bills if I downgrade?</p>
              <p className="text-sm text-zinc-400">
                All your existing bills remain intact. You won't be able to add more than 10 active bills until you upgrade again.
              </p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Is my payment information secure?</p>
              <p className="text-sm text-zinc-400">
                Absolutely! All payments are processed securely through Stripe. We never store your credit card information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feature({
  children,
  included = false,
  bold = false,
}: {
  children: React.ReactNode
  included?: boolean
  bold?: boolean
}) {
  return (
    <li className="flex items-start gap-2">
      {included ? (
        <Check className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
      ) : (
        <X className="w-5 h-5 text-zinc-600 shrink-0 mt-0.5" />
      )}
      <span
        className={cn(
          'text-sm',
          included ? 'text-white' : 'text-zinc-600 line-through',
          bold && 'font-semibold'
        )}
      >
        {children}
      </span>
    </li>
  )
}
