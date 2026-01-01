import { google, calendar_v3 } from 'googleapis'
import { getAuthenticatedClient } from './google'
import { Bill } from './supabase'

// Get Calendar client
function getCalendarClient(accessToken: string, refreshToken: string | null) {
  const auth = getAuthenticatedClient(accessToken, refreshToken)
  return google.calendar({ version: 'v3', auth })
}

// Calculate next occurrence date for a bill
function getNextDueDate(dueDay: number, recurrence: Bill['recurrence']): Date {
  const now = new Date()
  const currentDay = now.getDate()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let dueDate: Date

  if (recurrence === 'weekly') {
    // For weekly, use the due_day as day of week (0-6)
    const dayOfWeek = dueDay % 7
    const currentDayOfWeek = now.getDay()
    const daysUntil = (dayOfWeek - currentDayOfWeek + 7) % 7 || 7
    dueDate = new Date(currentYear, currentMonth, now.getDate() + daysUntil)
  } else {
    // For monthly/yearly/once, use due_day as day of month
    if (currentDay <= dueDay) {
      dueDate = new Date(currentYear, currentMonth, dueDay)
    } else {
      dueDate = new Date(currentYear, currentMonth + 1, dueDay)
    }
  }

  return dueDate
}

// Convert recurrence to Google Calendar RRULE
function getRecurrenceRule(recurrence: Bill['recurrence'], dueDay: number): string[] | undefined {
  switch (recurrence) {
    case 'monthly':
      return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${dueDay}`]
    case 'weekly':
      const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
      return [`RRULE:FREQ=WEEKLY;BYDAY=${days[dueDay % 7]}`]
    case 'yearly':
      return [`RRULE:FREQ=YEARLY`]
    case 'once':
    default:
      return undefined
  }
}

// Create a calendar event for a bill
export async function createBillEvent(
  accessToken: string,
  refreshToken: string | null,
  bill: Bill,
  calendarId: string = 'primary'
): Promise<string | null> {
  const calendar = getCalendarClient(accessToken, refreshToken)
  const dueDate = getNextDueDate(bill.due_day, bill.recurrence)

  // Format date as YYYY-MM-DD for all-day event
  const dateStr = dueDate.toISOString().split('T')[0]

  const event: calendar_v3.Schema$Event = {
    summary: `Bill Due: ${bill.name}`,
    description: `Amount: $${bill.amount.toFixed(2)}\nCategory: ${bill.category}${bill.notes ? `\nNotes: ${bill.notes}` : ''}`,
    start: {
      date: dateStr,
    },
    end: {
      date: dateStr,
    },
    recurrence: getRecurrenceRule(bill.recurrence, bill.due_day),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 * 3 }, // 3 days before
        { method: 'popup', minutes: 24 * 60 }, // 1 day before
      ],
    },
    colorId: getCategoryColor(bill.category),
  }

  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    })

    return response.data.id || null
  } catch (error) {
    console.error('Error creating calendar event:', error)
    throw error
  }
}

// Update an existing calendar event
export async function updateBillEvent(
  accessToken: string,
  refreshToken: string | null,
  bill: Bill,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken)
  const dueDate = getNextDueDate(bill.due_day, bill.recurrence)
  const dateStr = dueDate.toISOString().split('T')[0]

  const event: calendar_v3.Schema$Event = {
    summary: `Bill Due: ${bill.name}`,
    description: `Amount: $${bill.amount.toFixed(2)}\nCategory: ${bill.category}${bill.notes ? `\nNotes: ${bill.notes}` : ''}`,
    start: {
      date: dateStr,
    },
    end: {
      date: dateStr,
    },
    recurrence: getRecurrenceRule(bill.recurrence, bill.due_day),
    colorId: getCategoryColor(bill.category),
  }

  try {
    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    })
  } catch (error) {
    console.error('Error updating calendar event:', error)
    throw error
  }
}

// Delete a calendar event
export async function deleteBillEvent(
  accessToken: string,
  refreshToken: string | null,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken)

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    })
  } catch (error) {
    console.error('Error deleting calendar event:', error)
    throw error
  }
}

// Get list of user's calendars
export async function getCalendarList(
  accessToken: string,
  refreshToken: string | null
): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const calendar = getCalendarClient(accessToken, refreshToken)

  try {
    const response = await calendar.calendarList.list()
    return (response.data.items || []).map(cal => ({
      id: cal.id || '',
      summary: cal.summary || 'Untitled',
      primary: cal.primary || false,
    }))
  } catch (error) {
    console.error('Error getting calendar list:', error)
    throw error
  }
}

// Map categories to Google Calendar color IDs
function getCategoryColor(category: string): string {
  const colorMap: Record<string, string> = {
    Utilities: '9',      // Blue
    Subscriptions: '3',  // Purple
    Insurance: '10',     // Green
    Housing: '5',        // Yellow
    Transportation: '6', // Orange
    Healthcare: '11',    // Red
    'Food & Dining': '4', // Pink
    Entertainment: '7',   // Cyan
    Other: '8',          // Gray
  }
  return colorMap[category] || '8'
}
