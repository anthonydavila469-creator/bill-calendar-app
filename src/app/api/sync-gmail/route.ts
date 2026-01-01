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

      // Only create bill if: is a bill, high confidence, has name, AND has real amount > 0
      const hasValidAmount = parsed && typeof parsed.amount === 'number' && parsed.amount > 0

      if (parsed && parsed.isBill && parsed.confidence >= 70 && parsed.name && hasValidAmount) {
        // Create the bill
        const { data: bill, error: billError } = await supabase
          .from('bills')
          .insert({
            user_id: user.id,
            name: parsed.name,
            amount: parsed.amount, // Already validated as > 0
            due_day: parsed.dueDay || 1,
            recurrence: 'monthly', // Default to monthly for detected bills
            category: parsed.category,
            is_active: true,
            notes: (() => {
              const parts = [`Auto-detected from: "${email.subject}"`]
              if (parsed.amountText) parts.push(`Amount found: "${parsed.amountText}"`)
              if (parsed.dueDateText) parts.push(`Due date found: "${parsed.dueDateText}"`)
              return parts.join(' | ')
            })(),
          })
          .select()
          .single()

        if (!billError && bill) {
          billsCreated++

          // Track synced email
          await supabase
            .from('synced_emails')
            .insert({
              user_id: user.id,
              email_id: email.id,
              email_subject: email.subject,
              email_from: email.from,
              bill_id: bill.id,
            })
        }
      } else {
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
