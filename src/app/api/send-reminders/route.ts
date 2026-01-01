import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sendBillReminder, BillReminderData } from '@/lib/resend'
import { format, addDays, isSameDay } from 'date-fns'

// Send reminders for upcoming bills
export async function POST() {
  try {
    const supabase = await createClient()

    // Get all users with reminder enabled
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('reminder_enabled', true)

    if (!preferences || preferences.length === 0) {
      return NextResponse.json({
        message: 'No users with reminders enabled',
        sent: 0,
      })
    }

    let totalSent = 0
    const today = new Date()
    const currentDay = today.getDate()

    for (const prefs of preferences) {
      if (!prefs.email) continue

      // Get user's active bills
      const { data: bills } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', prefs.user_id)
        .eq('is_active', true)

      if (!bills || bills.length === 0) continue

      // Check which bills need reminders based on user's reminder_days setting
      const reminderDays = prefs.reminder_days || [1, 3, 7]
      const billsToRemind: BillReminderData[] = []

      for (const bill of bills) {
        const dueDay = bill.due_day

        // Calculate days until due (handling month wrap)
        let daysUntilDue: number
        if (dueDay >= currentDay) {
          daysUntilDue = dueDay - currentDay
        } else {
          // Due day is in next month
          const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
          daysUntilDue = daysInMonth - currentDay + dueDay
        }

        // Check if today is a reminder day for this bill
        if (reminderDays.includes(daysUntilDue)) {
          // Calculate actual due date for display
          const dueDate = addDays(today, daysUntilDue)

          billsToRemind.push({
            billName: bill.name,
            amount: bill.amount,
            dueDate: format(dueDate, 'MMMM d, yyyy'),
            daysUntilDue,
            category: bill.category,
          })
        }
      }

      // Send email if there are bills to remind about
      if (billsToRemind.length > 0) {
        const result = await sendBillReminder(prefs.email, billsToRemind)
        if (result.success) {
          totalSent++
        } else {
          console.error(`Failed to send reminder to ${prefs.email}:`, result.error)
        }
      }
    }

    return NextResponse.json({
      message: 'Reminders sent',
      sent: totalSent,
      usersChecked: preferences.length,
    })
  } catch (error) {
    console.error('Send reminders error:', error)
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    )
  }
}

// Manual trigger for testing (for a specific user)
export async function GET() {
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

    if (!prefs?.email) {
      return NextResponse.json(
        { error: 'No email configured for reminders' },
        { status: 400 }
      )
    }

    // Get user's active bills
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!bills || bills.length === 0) {
      return NextResponse.json({ message: 'No active bills' })
    }

    const today = new Date()
    const currentDay = today.getDate()

    // Get bills due in the next 7 days for test
    const billsToRemind: BillReminderData[] = []

    for (const bill of bills) {
      const dueDay = bill.due_day
      let daysUntilDue: number

      if (dueDay >= currentDay) {
        daysUntilDue = dueDay - currentDay
      } else {
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
        daysUntilDue = daysInMonth - currentDay + dueDay
      }

      if (daysUntilDue <= 7) {
        const dueDate = addDays(today, daysUntilDue)
        billsToRemind.push({
          billName: bill.name,
          amount: bill.amount,
          dueDate: format(dueDate, 'MMMM d, yyyy'),
          daysUntilDue,
          category: bill.category,
        })
      }
    }

    if (billsToRemind.length === 0) {
      return NextResponse.json({ message: 'No bills due in the next 7 days' })
    }

    const result = await sendBillReminder(prefs.email, billsToRemind)

    return NextResponse.json({
      success: result.success,
      error: result.error,
      billsIncluded: billsToRemind.length,
    })
  } catch (error) {
    console.error('Test reminder error:', error)
    return NextResponse.json(
      { error: 'Failed to send test reminder' },
      { status: 500 }
    )
  }
}
