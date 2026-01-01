import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Get user preferences
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: prefs, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" - not an error for us
      console.error('Error fetching preferences:', error)
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
    }

    // Return defaults if no preferences exist
    if (!prefs) {
      return NextResponse.json({
        reminder_enabled: true,
        reminder_days: [1, 3, 7],
        gmail_sync_enabled: false,
        google_connected: false,
        google_calendar_id: 'primary',
        last_gmail_sync: null,
        email: user.email,
      })
    }

    return NextResponse.json({
      ...prefs,
      google_connected: !!prefs.google_access_token,
      // Don't expose tokens to client
      google_access_token: undefined,
      google_refresh_token: undefined,
      google_token_expiry: undefined,
    })
  } catch (error) {
    console.error('Preferences GET error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Update user preferences
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      reminder_enabled,
      reminder_days,
      gmail_sync_enabled,
      google_calendar_id,
      email,
    } = body

    // Validate reminder_days
    const validReminderDays = Array.isArray(reminder_days)
      ? reminder_days.filter(d => typeof d === 'number' && d >= 0 && d <= 30)
      : [1, 3, 7]

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        reminder_enabled: reminder_enabled ?? true,
        reminder_days: validReminderDays,
        gmail_sync_enabled: gmail_sync_enabled ?? false,
        google_calendar_id: google_calendar_id || 'primary',
        email: email || user.email,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

    if (error) {
      console.error('Error updating preferences:', error)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Preferences PUT error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Disconnect Google account
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('user_preferences')
      .update({
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
        gmail_sync_enabled: false,
        last_gmail_sync: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (error) {
      console.error('Error disconnecting Google:', error)
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Preferences DELETE error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
