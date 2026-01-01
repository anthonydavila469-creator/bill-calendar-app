import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { deleteAutoDetectedBills } = body as { deleteAutoDetectedBills?: boolean }

    let billsDeleted = 0

    // Optionally delete auto-detected bills
    if (deleteAutoDetectedBills) {
      const { data: deletedBills } = await supabase
        .from('bills')
        .delete()
        .eq('user_id', user.id)
        .like('notes', 'Auto-detected from%')
        .select('id')

      billsDeleted = deletedBills?.length || 0
    }

    // Clear all synced emails for this user (so they can be re-processed)
    const { data: clearedEmails } = await supabase
      .from('synced_emails')
      .delete()
      .eq('user_id', user.id)
      .select('id')

    const emailsCleared = clearedEmails?.length || 0

    // Reset last sync time to force full 90-day scan
    await supabase
      .from('user_preferences')
      .update({ last_gmail_sync: null })
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      emailsCleared,
      billsDeleted,
      message: `Cleared ${emailsCleared} synced emails${billsDeleted > 0 ? ` and deleted ${billsDeleted} auto-detected bills` : ''}. Ready for re-sync.`,
    })
  } catch (error) {
    console.error('Resync preparation error:', error)
    return NextResponse.json(
      { error: 'Failed to prepare for re-sync' },
      { status: 500 }
    )
  }
}
