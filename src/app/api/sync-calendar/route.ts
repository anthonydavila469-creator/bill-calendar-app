import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createBillEvent, updateBillEvent, deleteBillEvent } from '@/lib/google-calendar'
import { ensureValidToken } from '@/lib/gmail'
import { Bill } from '@/lib/supabase'

// Sync a single bill to Google Calendar
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { billId, action } = body as { billId: string; action: 'create' | 'update' | 'delete' }

    // Get user preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs?.google_access_token) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      )
    }

    // Ensure token is valid
    const tokenExpiry = prefs.google_token_expiry
      ? new Date(prefs.google_token_expiry)
      : null

    const { accessToken, refreshToken } = await ensureValidToken(
      prefs.google_access_token,
      prefs.google_refresh_token,
      tokenExpiry
    )

    // Get the bill
    const { data: bill } = await supabase
      .from('bills')
      .select('*')
      .eq('id', billId)
      .eq('user_id', user.id)
      .single()

    if (!bill && action !== 'delete') {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    }

    const calendarId = prefs.google_calendar_id || 'primary'

    switch (action) {
      case 'create': {
        const eventId = await createBillEvent(
          accessToken,
          refreshToken,
          bill as Bill,
          calendarId
        )

        if (eventId) {
          await supabase
            .from('bills')
            .update({ google_event_id: eventId })
            .eq('id', billId)
        }

        return NextResponse.json({ success: true, eventId })
      }

      case 'update': {
        if (bill?.google_event_id) {
          await updateBillEvent(
            accessToken,
            refreshToken,
            bill as Bill,
            bill.google_event_id,
            calendarId
          )
        } else {
          // Create new event if none exists
          const eventId = await createBillEvent(
            accessToken,
            refreshToken,
            bill as Bill,
            calendarId
          )
          if (eventId) {
            await supabase
              .from('bills')
              .update({ google_event_id: eventId })
              .eq('id', billId)
          }
        }
        return NextResponse.json({ success: true })
      }

      case 'delete': {
        // Get the bill before it's deleted to get the event ID
        const { data: billToDelete } = await supabase
          .from('bills')
          .select('google_event_id')
          .eq('id', billId)
          .single()

        if (billToDelete?.google_event_id) {
          await deleteBillEvent(
            accessToken,
            refreshToken,
            billToDelete.google_event_id,
            calendarId
          )
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Calendar sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync calendar' },
      { status: 500 }
    )
  }
}

// Sync all bills to Google Calendar
export async function PUT() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs?.google_access_token) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 }
      )
    }

    // Ensure token is valid
    const tokenExpiry = prefs.google_token_expiry
      ? new Date(prefs.google_token_expiry)
      : null

    const { accessToken, refreshToken } = await ensureValidToken(
      prefs.google_access_token,
      prefs.google_refresh_token,
      tokenExpiry
    )

    // Get all active bills without Google event IDs
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('google_event_id', null)

    if (!bills || bills.length === 0) {
      return NextResponse.json({
        message: 'No bills to sync',
        synced: 0,
        total: 0,
      })
    }

    const calendarId = prefs.google_calendar_id || 'primary'
    let synced = 0

    for (const bill of bills) {
      try {
        const eventId = await createBillEvent(
          accessToken,
          refreshToken,
          bill as Bill,
          calendarId
        )

        if (eventId) {
          await supabase
            .from('bills')
            .update({ google_event_id: eventId })
            .eq('id', bill.id)
          synced++
        }
      } catch (err) {
        console.error(`Failed to sync bill ${bill.id}:`, err)
      }
    }

    return NextResponse.json({
      message: 'Calendar sync completed',
      synced,
      total: bills.length,
    })
  } catch (error) {
    console.error('Calendar sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync calendar' },
      { status: 500 }
    )
  }
}
