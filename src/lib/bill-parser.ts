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

2. COMPANY NAME EXTRACTION - CRITICAL:

   PRIORITY ORDER for finding the company name:
   a) FIRST: Look in email "From:" field for recognized company
      - Example: "noreply@chase.com" → Extract "Chase"
      - Example: "statements@capitalone.com" → Extract "Capital One"

   b) SECOND: Look in email Subject for company name
      - Example: "Your Amex Statement" → "American Express"
      - Example: "TXU Energy Bill Ready" → "TXU Energy"

   c) THIRD: Look in email body header/logo area (usually at top)
      - Example: "GEICO | Auto Insurance" → "GEICO"
      - Example: Company logo text at top of email

   COMPANY NAME FORMATTING:
   - Use the FULL company name, not abbreviations
   - For CREDIT CARDS: Include the specific card type if mentioned
     * "Chase Freedom" or "Chase Sapphire" or "Chase Ink Business" (NOT just "Chase")
     * Look for card name in subject or body to distinguish
   - For UTILITIES: Use official company name from header
   - Avoid generic names like "Bill", "Statement", "Account", "Company"
   - Company name should be 3-50 characters
   - If name contains random numbers/special chars, it's likely wrong

3. AMOUNT EXTRACTION - Use this PRIORITY ORDER:

   FOR CREDIT CARDS (Chase, Citi, Capital One, Discover, Amex, etc.):
   - CRITICAL: ALWAYS use Statement Balance, NOT Minimum Payment
   - SEARCH PRIORITY (use the FIRST one you find):
     1. "Statement Balance:" or "New Balance:" ← This is the REAL bill amount
     2. "Current Balance:" or "Total Balance:"
     3. "Amount Due:" or "Total Amount Due:"
     4. NEVER EVER USE: "Minimum Payment", "Minimum Due", "Min Payment"

   - VALIDATION RULE:
     * If email shows BOTH Statement Balance AND Minimum Payment:
       → Use the LARGER amount (always Statement Balance)
     * If you only find Minimum Payment text:
       → Set confidence to 50 (very low, needs review)
     * For Citi specifically:
       → Look for "Citi" or "Citi Custom Cash" in header/logo
       → Statement Balance shown in table format

   Example 1: If email shows "Minimum Payment: $40.00" and "Statement Balance: $2,847.23"
   → Use amount: 2847.23 (the statement balance), NOT $40

   Example 2: Citi email with "Payment Due Date: Friday, January 23, 2026", "Statement Balance: $3,278.44", "Minimum Payment Due: $95.94"
   → Use amount: 3278.44 (NOT 95.94), dueDay: 23, confidence: 90

   FOR UTILITIES/SERVICES (electric, gas, water, internet, phone):
   - "Amount Due" or "Total Due"
   - "Current Charges" or "New Charges"
   - "Balance Due"

   FOR INSURANCE (health, auto, home, life):
   - CRITICAL: Insurance bills are MONTHLY, not annual
   - Look for: "Monthly Premium", "Monthly Payment", "Installment Amount"
   - If email shows "Annual Premium: $X", divide by 12 to get monthly amount
   - Examples:
     * "Annual Premium: $3,274" → amount: 272.83 (3274/12)
     * "$3,000/year" → amount: 250
   - If only annual amount found, set confidence lower (60-70 range)
   - VALIDATION: Monthly insurance over $500 is unusual (lower confidence)

4. DUE DAY EXTRACTION - CRITICAL:

   SEARCH PATTERNS (in priority order):
   a) Explicit labels: "Due Date:", "Payment Due:", "Due By:"
      - "Due Date: January 15, 2025" → dueDay: 15
      - "Payment Due: 01/15/2025" → dueDay: 15

   b) "Please pay by" or "Pay by" phrases
      - "Please pay by January 15" → dueDay: 15
      - "Pay by the 15th" → dueDay: 15

   c) Table/structured format
      - Look for row with "Due Date" or "Payment Due" header

   d) For credit cards: Statement date + typical payment period
      - Common pattern: Statement date + 21-25 days

   DATE PARSING FORMATS:
   - MM/DD/YYYY: "01/15/2025" → day = 15
   - Month DD, YYYY: "January 15, 2025" → day = 15
   - Ordinal: "15th of January" → day = 15
   - "Due on the Xth" → day = X

   VALIDATION:
   - Due day must be 1-31
   - If multiple dates found, use the LATEST one (likely the due date)
   - Don't confuse "Statement Date" with "Due Date"
   - Don't confuse "AutoPay Date" with "Due Date"
   - If uncertain about due date, lower confidence by 10 points

5. VALIDATION & CONFIDENCE:
   - If you cannot find a real dollar amount in the email, set isBill: false
   - Amount must be > 0 to be a valid bill
   - Do NOT guess or make up amounts
   - If amount > $2,000 for non-credit-card, lower confidence to max 70
   - If company name is generic or unclear, lower confidence by 15 points
   - If due date found with explicit label, increase confidence by 10 points

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
