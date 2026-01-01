import { BILL_CATEGORIES, BillCategory } from './supabase'

// API route handler for AI categorization
export async function categorizeBill(billName: string): Promise<BillCategory> {
  try {
    const response = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billName }),
    })

    if (!response.ok) {
      throw new Error('Failed to categorize')
    }

    const data = await response.json()
    return data.category as BillCategory
  } catch (error) {
    console.error('AI categorization failed:', error)
    return 'Other'
  }
}

// Fallback categorization using keyword matching
export function fallbackCategorize(billName: string): BillCategory {
  const name = billName.toLowerCase()

  const categoryKeywords: Record<BillCategory, string[]> = {
    'Utilities': ['electric', 'electricity', 'gas', 'water', 'sewer', 'trash', 'garbage', 'utility', 'power', 'energy', 'pge', 'pg&e', 'edison', 'sdg&e'],
    'Subscriptions': ['netflix', 'hulu', 'disney', 'spotify', 'apple music', 'youtube', 'amazon prime', 'hbo', 'paramount', 'peacock', 'subscription', 'membership', 'adobe', 'microsoft 365', 'dropbox', 'icloud'],
    'Insurance': ['insurance', 'allstate', 'geico', 'progressive', 'state farm', 'liberty mutual', 'farmers', 'usaa', 'aetna', 'cigna', 'kaiser', 'anthem', 'blue cross', 'united health'],
    'Housing': ['rent', 'mortgage', 'hoa', 'property tax', 'home', 'apartment', 'housing', 'landlord', 'lease'],
    'Transportation': ['car', 'auto', 'vehicle', 'gas station', 'fuel', 'uber', 'lyft', 'parking', 'toll', 'transit', 'metro', 'bus pass', 'car payment', 'lease payment'],
    'Healthcare': ['doctor', 'hospital', 'medical', 'health', 'dental', 'vision', 'pharmacy', 'prescription', 'cvs', 'walgreens', 'clinic', 'therapy', 'mental health'],
    'Food & Dining': ['restaurant', 'doordash', 'ubereats', 'grubhub', 'meal kit', 'blue apron', 'hello fresh', 'dining', 'food delivery'],
    'Entertainment': ['gym', 'fitness', 'planet fitness', '24 hour', 'games', 'gaming', 'xbox', 'playstation', 'nintendo', 'twitch', 'discord nitro', 'vpn', 'nordvpn'],
    'Other': [],
  }

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category as BillCategory
    }
  }

  return 'Other'
}
