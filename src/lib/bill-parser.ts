import Anthropic from '@anthropic-ai/sdk'
import { BILL_CATEGORIES, BillCategory } from './supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ParsedBill {
  isBill: boolean
  name: string | null
  amount: number | null
  dueDay: number | null
  category: BillCategory
  confidence: number
  dueDateText: string | null  // Raw text found (e.g., "January 15, 2025")
  amountText: string | null   // Raw text found (e.g., "$152.47")
}

// Parse email content to extract bill information using Claude
export async function parseBillFromEmail(
  subject: string,
  from: string,
  body: string
): Promise<ParsedBill> {
  const prompt = `Analyze this email to detect if it contains an ACTUAL BILL with a real dollar amount.

Email Subject: ${subject}
From: ${from}
Email Body:
${body.slice(0, 8000)}

CRITICAL RULES - READ CAREFULLY:

1. SET isBill: false for these types of emails (NOT actual bills):
   - "Your statement is now available" (no amount shown, just a notification)
   - "AutoPay reminder" or "Payment reminder" without showing the actual amount
   - "Log in to view your bill" without the amount in the email
   - Account alerts, security notices, promotional emails
   - Confirmation emails for payments already made

2. AMOUNT EXTRACTION - Use this PRIORITY ORDER:

   FOR CREDIT CARDS (Chase, Citi, Capital One, Discover, Amex, etc.):
   - BEST: "Statement Balance" or "New Balance" (this is the REAL bill amount)
   - GOOD: "Current Balance" or "Total Balance"
   - OK: "Total Amount Due" or "Amount Due"
   - NEVER USE: "Minimum Payment Due" - this is NOT the real bill!

   Example: If email shows "Minimum Payment: $40.00" and "Statement Balance: $2,847.23"
   → Use amount: 2847.23 (the statement balance), NOT $40

   FOR UTILITIES/SERVICES (electric, gas, water, internet, phone):
   - "Amount Due" or "Total Due"
   - "Current Charges" or "New Charges"
   - "Balance Due"

3. DUE DAY - Extract the day of month (1-31):
   - "Due: January 15, 2025" → dueDay: 15
   - "Payment due on the 1st" → dueDay: 1
   - "Due by 03/20/25" → dueDay: 20
   - "Due Date: 12/15/2024" → dueDay: 15

4. VALIDATION:
   - If you cannot find a real dollar amount in the email, set isBill: false
   - Amount must be > 0 to be a valid bill
   - Do NOT guess or make up amounts

EXAMPLES:
- Email says "Your Chase statement is ready. Log in to view." → isBill: false (no amount)
- Email says "Minimum Payment: $25, Statement Balance: $1,456.78" → amount: 1456.78
- Email says "Your TXU Energy bill is $162.00, due Jan 7" → amount: 162.00, dueDay: 7
- Email says "AutoPay scheduled for your account" → isBill: false (just notification)

Return JSON:
{
  "isBill": boolean (TRUE only if email contains actual bill with real amount),
  "name": string or null (company name, e.g. "Chase Credit Card", "TXU Energy"),
  "amount": number or null (the REAL bill amount, NOT minimum payment),
  "amountText": string or null (exact text where you found the amount),
  "dueDay": number (1-31) or null,
  "dueDateText": string or null (exact text where you found the due date),
  "category": string (one of: ${BILL_CATEGORIES.join(', ')}),
  "confidence": number (0-100)
}

Only return the JSON object, no other text.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Use AI's direct dueDay number (no Date parsing needed)
    let dueDay: number | null = null
    if (typeof parsed.dueDay === 'number' && parsed.dueDay >= 1 && parsed.dueDay <= 31) {
      dueDay = parsed.dueDay
    }

    // Validate category
    const category: BillCategory = BILL_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : 'Other'

    return {
      isBill: Boolean(parsed.isBill),
      name: parsed.name || null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      dueDay,
      category,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      dueDateText: parsed.dueDateText || null,
      amountText: parsed.amountText || null,
    }
  } catch (error) {
    console.error('Error parsing bill from email:', error)
    return {
      isBill: false,
      name: null,
      amount: null,
      dueDay: null,
      category: 'Other',
      confidence: 0,
      dueDateText: null,
      amountText: null,
    }
  }
}

// Batch parse multiple emails
export async function parseBillsFromEmails(
  emails: Array<{ id: string; subject: string; from: string; body: string }>
): Promise<Map<string, ParsedBill>> {
  const results = new Map<string, ParsedBill>()

  // Process in parallel but with a limit to avoid rate limits
  const batchSize = 5
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const promises = batch.map(async email => {
      const parsed = await parseBillFromEmail(email.subject, email.from, email.body)
      return { id: email.id, parsed }
    })

    const batchResults = await Promise.all(promises)
    for (const { id, parsed } of batchResults) {
      results.set(id, parsed)
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
