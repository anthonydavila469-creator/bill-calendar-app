'use client'

import { useEffect, useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction'
import { EventClickArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { startOfMonth, endOfMonth, setDate, format } from 'date-fns'

type CalendarEvent = {
  id: string
  title: string
  start: string  // Use ISO date string for all-day events
  allDay: boolean
  backgroundColor: string
  borderColor: string
  extendedProps: {
    bill: Bill
    isPaid: boolean
  }
}

const categoryColors: Record<string, { bg: string; border: string }> = {
  Utilities: { bg: '#3b82f6', border: '#2563eb' },
  Subscriptions: { bg: '#8b5cf6', border: '#7c3aed' },
  Insurance: { bg: '#22c55e', border: '#16a34a' },
  Housing: { bg: '#f97316', border: '#ea580c' },
  Transportation: { bg: '#eab308', border: '#ca8a04' },
  Healthcare: { bg: '#ef4444', border: '#dc2626' },
  'Credit Cards': { bg: '#0ea5e9', border: '#0284c7' },
  'Food & Dining': { bg: '#ec4899', border: '#db2777' },
  Entertainment: { bg: '#6366f1', border: '#4f46e5' },
  Other: { bg: '#6b7280', border: '#4b5563' },
}

const getCategoryClass = (category: string) => {
  const classes: Record<string, string> = {
    Utilities: 'badge-utilities',
    Subscriptions: 'badge-subscriptions',
    Insurance: 'badge-insurance',
    Housing: 'badge-housing',
    Transportation: 'badge-transportation',
    Healthcare: 'badge-healthcare',
    'Credit Cards': 'badge-credit-cards',
    'Food & Dining': 'badge-food',
    Entertainment: 'badge-entertainment',
    Other: 'badge-other',
  }
  return classes[category] || 'badge-other'
}

export default function CalendarPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date())
  const [isUndoing, setIsUndoing] = useState(false)
  const calendarRef = useRef<FullCalendar>(null)
  const supabase = createClient()

  // Fetch bills once on mount
  useEffect(() => {
    fetchBills()
  }, [])

  // Update events when bills change or displayed month changes
  useEffect(() => {
    if (bills.length > 0) {
      updateEvents(displayedMonth)
    }
  }, [bills, payments, displayedMonth])

  async function fetchBills() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [billsResult, paymentsResult] = await Promise.all([
      supabase.from('bills').select('*').eq('is_active', true),
      supabase.from('payments').select('*')
    ])

    if (billsResult.data) {
      setBills(billsResult.data)
    }

    if (paymentsResult.data) {
      setPayments(paymentsResult.data)
    }

    setLoading(false)
  }

  function updateEvents(month: Date) {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Filter payments for this month
    const monthPayments = payments.filter(p => {
      const paidAt = new Date(p.paid_at)
      return paidAt >= monthStart && paidAt <= monthEnd
    })

    const calendarEvents: CalendarEvent[] = bills.map(bill => {
      const isPaid = monthPayments.some(p => p.bill_id === bill.id)
      const colors = categoryColors[bill.category] || categoryColors.Other
      const dueDate = setDate(month, bill.due_day)
      // Format as YYYY-MM-DD for all-day events (no time component)
      const dateString = format(dueDate, 'yyyy-MM-dd')

      const amount = Number(bill.amount)

      return {
        id: bill.id,
        title: bill.name,
        start: dateString,
        allDay: true,
        backgroundColor: isPaid ? '#14b8a6' : colors.bg,
        borderColor: isPaid ? '#0d9488' : colors.border,
        extendedProps: {
          bill,
          isPaid,
          amount,
          shortName: bill.name.length > 12 ? bill.name.substring(0, 12) + '…' : bill.name
        }
      }
    })

    setEvents(calendarEvents)
  }

  const handleEventClick = (info: EventClickArg) => {
    const bill = info.event.extendedProps.bill as Bill
    if (bill) {
      setSelectedBill(bill)
    }
  }

  const handleDateClick = (info: DateClickArg) => {
    const billsOnDate = bills.filter(b => b.due_day === info.date.getDate())
    if (billsOnDate.length === 1) {
      setSelectedBill(billsOnDate[0])
    }
  }

  const handleMarkPaid = async () => {
    if (!selectedBill) return

    const { error } = await supabase.from('payments').insert({
      bill_id: selectedBill.id,
      amount_paid: selectedBill.amount,
    })

    if (!error) {
      setSelectedBill(null)
      fetchBills() // Refresh data
    }
  }

  const handleUndoPayment = async () => {
    if (!selectedBill) return

    setIsUndoing(true)

    // Find the payment for this bill in the current displayed month
    const monthStart = startOfMonth(displayedMonth)
    const monthEnd = endOfMonth(displayedMonth)
    const payment = payments.find(p => {
      const paidAt = new Date(p.paid_at)
      return p.bill_id === selectedBill.id && paidAt >= monthStart && paidAt <= monthEnd
    })

    if (payment) {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id)

      if (!error) {
        setSelectedBill(null)
        fetchBills() // Refresh data
      }
    }

    setIsUndoing(false)
  }

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    // Get the middle of the visible range to determine the actual displayed month
    const visibleStart = dateInfo.start
    const visibleEnd = dateInfo.end
    const middleDate = new Date((visibleStart.getTime() + visibleEnd.getTime()) / 2)

    // Only update if the month actually changed
    const newMonth = middleDate.getMonth()
    const newYear = middleDate.getFullYear()
    if (newMonth !== displayedMonth.getMonth() || newYear !== displayedMonth.getFullYear()) {
      setDisplayedMonth(middleDate)
    }
  }

  // Custom event rendering for a clean, professional look
  const renderEventContent = (eventInfo: EventContentArg) => {
    const { amount, shortName, isPaid } = eventInfo.event.extendedProps
    const formattedAmount = amount > 0 ? `$${amount.toLocaleString()}` : '$0'

    return (
      <div className="bill-event" title={eventInfo.event.title}>
        <span className="bill-event-amount">{formattedAmount}</span>
        <span className="bill-event-name">{shortName}</span>
        {isPaid && (
          <svg className="bill-event-check" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Calendar</h1>
        <p className="text-zinc-400">View your bills by due date</p>
      </div>

      {/* Legend */}
      <div className="glass-card rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-medium">Categories</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryColors).map(([category, colors]) => (
            <span
              key={category}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: colors.bg }}
            >
              {category}
            </span>
          ))}
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-teal-500 text-black">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Paid
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="glass-card rounded-2xl p-6">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          datesSet={handleDatesSet}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: ''
          }}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
        />
      </div>

      {/* Bill Detail Dialog */}
      <Dialog open={!!selectedBill} onOpenChange={() => setSelectedBill(null)}>
        <DialogContent className="bg-[#12121a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{selectedBill?.name}</DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Amount</p>
                  <p className="text-2xl font-bold text-white">
                    ${Number(selectedBill.amount).toFixed(2)}
                  </p>
                </div>
                <div className="glass-card rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Due Day</p>
                  <p className="text-2xl font-bold text-white">{selectedBill.due_day}th</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Category</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getCategoryClass(selectedBill.category)}`}>
                    {selectedBill.category}
                  </span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Recurrence</p>
                  <p className="text-white capitalize">{selectedBill.recurrence}</p>
                </div>
              </div>

              {selectedBill.notes && (
                <div className="pt-3 border-t border-white/5">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Notes</p>
                  <p className="text-zinc-300">{selectedBill.notes}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                {!payments.some(p => p.bill_id === selectedBill.id) ? (
                  <Button
                    onClick={handleMarkPaid}
                    className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl h-12"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Mark as Paid
                  </Button>
                ) : (
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 flex items-center justify-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-xl py-3 px-4">
                      <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-teal-400 font-medium">Paid</span>
                    </div>
                    <Button
                      onClick={handleUndoPayment}
                      disabled={isUndoing}
                      variant="outline"
                      className="bg-white/5 border-white/10 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 text-zinc-400 rounded-xl h-12 px-4"
                    >
                      {isUndoing ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Undo
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
