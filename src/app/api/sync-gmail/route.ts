import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { searchBillEmails, ensureValidToken } from '@/lib/gmail'
import { parseBillsFromEmails } from '@/lib/bill-parser'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user preferences with Google tokens
    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (prefsError || !prefs) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      )
    }

    if (!prefs.google_access_token) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      )
    }

    // Ensure token is valid (refresh if needed)
    const tokenExpiry = prefs.google_token_expiry
      ? new Date(prefs.google_token_expiry)
      : null

    const { accessToken, refreshToken, expiry } = await ensureValidToken(
      prefs.google_access_token,
      prefs.google_refresh_token,
      tokenExpiry
    )

    // Update tokens if refreshed
    if (accessToken !== prefs.google_access_token) {
      await supabase
        .from('user_preferences')
        .update({
          google_access_token: accessToken,
          google_refresh_token: refreshToken,
          google_token_expiry: expiry?.toISOString(),
        })
        .eq('user_id', user.id)
    }

    // Get already synced email IDs
    const { data: syncedEmails } = await supabase
      .from('synced_emails')
      .select('email_id')
      .eq('user_id', user.id)

    const syncedEmailIds = new Set(syncedEmails?.map(e => e.email_id) || [])

    // Search for bill emails
    // Force a full 1-year scan if last sync was less than 1 hour ago (likely a retry after fixing issues)
    const lastSync = prefs.last_gmail_sync ? new Date(prefs.last_gmail_sync) : null
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const afterDate = (!lastSync || lastSync > oneHourAgo)
      ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Last 365 days (1 year)
      : lastSync

    console.log('Gmail sync: searching for emails after', afterDate.toISOString())

    const emails = await searchBillEmails(accessToken, refreshToken, afterDate)

    console.log('Gmail sync: found', emails.length, 'emails matching bill keywords')

    // Filter out already synced emails
    const newEmails = emails.filter(e => !syncedEmailIds.has(e.id))

    if (newEmails.length === 0) {
      // Update last sync time
      await supabase
        .from('user_preferences')
        .update({ last_gmail_sync: new Date().toISOString() })
        .eq('user_id', user.id)

      return NextResponse.json({
        message: 'No new bill emails found',
        emailsScanned: emails.length,
        billsCreated: 0,
      })
    }

    // Parse emails with AI
    const parsedBills = await parseBillsFromEmails(
      newEmails.map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        body: e.body,
      }))
    )

    // Create bills for detected ones
    let billsCreated = 0
    for (const email of newEmails) {
      const parsed = parsedBills.get(email.id)

      // Log what AI extracted for debugging
      console.log(`Parsed email "${email.subject}" from ${email.from}:`, {
        isBill: parsed?.isBill,
        name: parsed?.name,
        amount: parsed?.amount,
        amountText: parsed?.amountText,
        dueDay: parsed?.dueDay,
        dueDateText: parsed?.dueDateText,
        category: parsed?.category,
        confidence: parsed?.confidence
      })

      // Only create bill if: is a bill, high confidence, has name, AND has real amount > 0
      const hasValidAmount = parsed && typeof parsed.amount === 'number' && parsed.amount > 0

      if (parsed && parsed.isBill && parsed.confidence >= 70 && parsed.name && hasValidAmount) {
        // Check if a bill with same name, amount, and due_day already exists
        // This prevents duplicates when re-scanning with "Keep Bills" option
        // Uses normalized matching to catch variations (case, spacing, decimal precision)
        const normalizedAmount = Number(parsed.amount).toFixed(2)
        const amountTolerance = 0.50 // Allow 50 cent variance

        const { data: existingBills } = await supabase
          .from('bills')
          .select('*')
          .eq('user_id', user.id)
          .ilike('name', parsed.name) // Case-insensitive match
          .gte('amount', Number(normalizedAmount) - amountTolerance)
          .lte('amount', Number(normalizedAmount) + amountTolerance)
          .eq('due_day', parsed.dueDay || 1)
          .eq('is_active', true)
          .limit(1)

        let billId: string | null = null

        if (existingBills && existingBills.length > 0) {
          // Bill already exists, use existing bill
          billId = existingBills[0].id
          console.log(`⚠️  Duplicate prevented: Bill "${parsed.name}" already exists (ID: ${billId})`)
        } else {
          // Create new bill via centralized API (with limit enforcement)
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            const createRes = await fetch(`${appUrl}/api/bills/create`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Pass auth token from current session
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              },
              body: JSON.stringify({
                name: parsed.name,
                amount: parsed.amount,
                due_day: parsed.dueDay || 1,
                recurrence: 'monthly',
                category: parsed.category,
                notes: (() => {
                  const parts = [`Auto-detected from: "${email.subject}"`]
                  if (parsed.amountText) parts.push(`Amount found: "${parsed.amountText}"`)
                  if (parsed.dueDateText) parts.push(`Due date found: "${parsed.dueDateText}"`)
                  return parts.join(' | ')
                })(),
              }),
            })

            const createData = await createRes.json()

            if (createRes.ok && createData.bill) {
              billId = createData.bill.id
              billsCreated++
              console.log(`✅ Bill created: "${parsed.name}" - $${parsed.amount} due day ${parsed.dueDay} (confidence: ${parsed.confidence})`)
            } else if (createData.upgradeRequired) {
              console.log(`⚠️ Bill limit reached - skipping "${parsed.name}" (Free tier: ${createData.limit} bills)`)
              // Don't create synced_email entry to allow retry after upgrade
              continue
            } else {
              console.error(`❌ Failed to create bill for "${parsed.name}":`, createData.error)
            }
          } catch (error: any) {
            console.error(`❌ Failed to create bill for "${parsed.name}":`, error.message)
          }
        }

        if (billId) {
          // Track synced email (whether using existing or new bill)
          await supabase
            .from('synced_emails')
            .insert({
              user_id: user.id,
              email_id: email.id,
              email_subject: email.subject,
              email_from: email.from,
              bill_id: billId,
            })
        }
      } else {
        // Determine why bill was rejected
        const rejectionReason = !parsed
          ? 'Parse failed - no response from AI'
          : !parsed.isBill
          ? 'Not recognized as bill (isBill: false)'
          : parsed.confidence < 70
          ? `Low confidence (${parsed.confidence}/100 - threshold is 70)`
          : !parsed.name
          ? 'No company name found'
          : !hasValidAmount
          ? parsed.amount === null
            ? 'No amount found in email'
            : parsed.amount <= 0
            ? `Invalid amount: $${parsed.amount}`
            : 'Amount validation failed'
          : 'Unknown reason'

        console.log(`❌ Bill rejected from "${email.subject}": ${rejectionReason}`)

        // Log rejected bill for user review
        await supabase.from('rejected_bills').insert({
          user_id: user.id,
          email_id: email.id,
          email_subject: email.subject,
          email_from: email.from,
          parsed_name: parsed?.name || null,
          parsed_amount: parsed?.amount || null,
          parsed_due_day: parsed?.dueDay || null,
          parsed_category: parsed?.category || 'Other',
          confidence: parsed?.confidence || 0,
          rejection_reason: rejectionReason,
        })

        // Track as processed but no bill created
        await supabase
          .from('synced_emails')
          .insert({
            user_id: user.id,
            email_id: email.id,
            email_subject: email.subject,
            email_from: email.from,
            bill_id: null,
          })
      }
    }

    // Update last sync time
    await supabase
      .from('user_preferences')
      .update({ last_gmail_sync: new Date().toISOString() })
      .eq('user_id', user.id)

    return NextResponse.json({
      message: 'Gmail sync completed',
      emailsScanned: newEmails.length,
      billsCreated,
    })
  } catch (error) {
    console.error('Gmail sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Gmail' },
      { status: 500 }
    )
  }
}
