import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { BILL_CATEGORIES } from '@/lib/supabase'
import { fallbackCategorize } from '@/lib/ai'

export async function POST(request: Request) {
  try {
    const { billName } = await request.json()

    if (!billName) {
      return NextResponse.json({ error: 'Bill name required' }, { status: 400 })
    }

    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Use fallback categorization if no API key
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

    return NextResponse.json({ category, method: 'ai' })
  } catch (error) {
    console.error('Categorization error:', error)
    // Fall back to keyword matching
    const { billName } = await request.json().catch(() => ({ billName: '' }))
    const category = fallbackCategorize(billName)
    return NextResponse.json({ category, method: 'fallback' })
  }
}
