import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { BILL_CATEGORIES } from '@/lib/supabase'
import { fallbackCategorize } from '@/lib/ai'
import { createClient } from '@/lib/supabase-server'
import { canAccessAI } from '@/lib/subscription'

export async function POST(request: Request) {
  try {
    const { billName } = await request.json()

    if (!billName) {
      return NextResponse.json({ error: 'Bill name required' }, { status: 400 })
    }

    // Check user's subscription tier
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let subscriptionTier: 'free' | 'pro' = 'free'

    if (user) {
      // Fetch user's subscription tier
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .single()

      subscriptionTier = (prefs?.subscription_tier || 'free') as 'free' | 'pro'
    }

    // Free tier: use fallback categorization (keyword matching)
    if (!canAccessAI(subscriptionTier)) {
      const category = fallbackCategorize(billName)
      return NextResponse.json({
        category,
        method: 'fallback',
        tier: subscriptionTier,
        message: subscriptionTier === 'free' ? 'Upgrade to Pro for AI-powered categorization' : undefined,
      })
    }

    // Pro tier: use AI categorization
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Fallback if API key not configured
      const category = fallbackCategorize(billName)
      return NextResponse.json({ category, method: 'fallback' })
    }

    const anthropic = new Anthropic({ apiKey })

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `Categorize this bill into exactly one of these categories: ${BILL_CATEGORIES.join(', ')}.

Bill name: "${billName}"

Respond with ONLY the category name, nothing else.`,
        },
      ],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Validate the response is a valid category
    const category = BILL_CATEGORIES.find(
      cat => cat.toLowerCase() === responseText.toLowerCase()
    ) || fallbackCategorize(billName)

    return NextResponse.json({ category, method: 'ai', tier: subscriptionTier })
  } catch (error) {
    console.error('Categorization error:', error)
    // Fall back to keyword matching - use 'Other' since body was already consumed
    const category = fallbackCategorize('')
    return NextResponse.json({ category, method: 'fallback' })
  }
}
