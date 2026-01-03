'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction'
import { EventClickArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { startOfMonth, endOfMonth, setDate, format, isSameMonth, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import {
  PageHeader,
  StatCard,
  spacing,
  glass,
  getCategoryColor,
} from '@/components/design-system'
import { BillPill, MoreBillsButton } from '@/components/calendar/bill-pill'
import { DayAgenda } from '@/components/calendar/day-agenda'
import { BillDetailModal } from '@/components/calendar/bill-detail-modal'
import { cn } from '@/lib/utils'

type BillWithPayment = Bill & {
  isPaid: boolean
}

type CalendarEvent = {
  id: string
  title: string
  start: string
  allDay: boolean
  backgroundColor: string
  borderColor: string
  extendedProps: {
    bill: Bill
    isPaid: boolean
    amount: number
  }
}

const MAX_PILLS_PER_DAY = 2

export default function CalendarPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date())
  const [isNavigating, setIsNavigating] = useState(false)
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const calendarRef = useRef<FullCalendar>(null)
  const supabase = createClient()

  // Calendar navigation handlers
  const handlePrevMonth = () => {
    if (isNavigating) return
    setIsNavigating(true)
    calendarRef.current?.getApi().prev()
    setTimeout(() => setIsNavigating(false), 200)
  }

  const handleNextMonth = () => {
    if (isNavigating) return
    setIsNavigating(true)
    calendarRef.current?.getApi().next()
    setTimeout(() => setIsNavigating(false), 200)
  }

  const handleToday = () => {
    if (isNavigating) return
    setIsNavigating(true)
    calendarRef.current?.getApi().today()
    setSelectedDate(null) // Clear selected date when going to today
    setTimeout(() => setIsNavigating(false), 200)
  }

  const isCurrentMonth = isSameMonth(displayedMonth, new Date())

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
      const dueDate = setDate(month, bill.due_day)
      const dateString = format(dueDate, 'yyyy-MM-dd')
      const amount = Number(bill.amount)

      return {
        id: bill.id,
        title: bill.name,
        start: dateString,
        allDay: true,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          bill,
          isPaid,
          amount,
        }
      }
    })

    setEvents(calendarEvents)
  }

  // Get bills for a specific date
  const getBillsForDate = (date: Date): BillWithPayment[] => {
    const day = date.getDate()
    const monthStart = startOfMonth(displayedMonth)
    const monthEnd = endOfMonth(displayedMonth)

    return bills
      .filter(b => b.due_day === day)
      .map(bill => {
        const isPaid = payments.some(p => {
          const paidAt = new Date(p.paid_at)
          return p.bill_id === bill.id && paidAt >= monthStart && paidAt <= monthEnd
        })
        return { ...bill, isPaid }
      })
  }

  const handleEventClick = (info: EventClickArg) => {
    const bill = info.event.extendedProps.bill as Bill
    if (bill) {
      setSelectedBill(bill)
      setSelectedDate(null) // Close day agenda when opening bill detail
    }
  }

  const handleDateClick = (info: DateClickArg) => {
    const billsOnDate = getBillsForDate(info.date)

    if (billsOnDate.length === 0) {
      // No bills on this date, do nothing
      return
    } else if (billsOnDate.length === 1) {
      // Single bill, open detail modal directly
      setSelectedBill(billsOnDate[0])
    } else {
      // Multiple bills, open day agenda
      setSelectedDate(info.date)
    }
  }

  const handleMarkPaid = async (bill: Bill) => {
    const billName = bill.name
    const billAmount = bill.amount

    const { data, error } = await supabase
      .from('payments')
      .insert({
        bill_id: bill.id,
        amount_paid: bill.amount,
      })
      .select('id')
      .single()

    if (!error && data) {
      setSelectedBill(null)
      setSelectedDate(null)
      await fetchBills()
      toast.success(`${billName} marked as paid!`, {
        description: `$${Number(billAmount).toFixed(2)} recorded`,
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error: undoError } = await supabase
              .from('payments')
              .delete()
              .eq('id', data.id)

            if (!undoError) {
              toast.success(`Payment undone for ${billName}`)
              fetchBills()
            } else {
              toast.error('Failed to undo payment')
            }
          },
        },
      })
    } else {
      toast.error('Failed to mark as paid')
    }
  }

  const handleUndoPayment = async (bill: Bill) => {
    const monthStart = startOfMonth(displayedMonth)
    const monthEnd = endOfMonth(displayedMonth)
    const payment = payments.find(p => {
      const paidAt = new Date(p.paid_at)
      return p.bill_id === bill.id && paidAt >= monthStart && paidAt <= monthEnd
    })

    if (payment) {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id)

      if (!error) {
        toast.success(`Payment undone for ${bill.name}`)
        setSelectedBill(null)
        setSelectedDate(null)
        fetchBills()
      } else {
        toast.error('Failed to undo payment')
      }
    }
  }

  const handleDeleteBill = async (bill: Bill) => {
    const { error } = await supabase
      .from('bills')
      .update({ is_active: false })
      .eq('id', bill.id)

    if (!error) {
      toast.success(`${bill.name} deleted`)
      setSelectedBill(null)
      fetchBills()
    } else {
      toast.error('Failed to delete bill')
    }
  }

  const handleDatesSet = (dateInfo: DatesSetArg) => {
    const middleDate = new Date((dateInfo.start.getTime() + dateInfo.end.getTime()) / 2)
    const newMonth = middleDate.getMonth()
    const newYear = middleDate.getFullYear()

    if (newMonth !== displayedMonth.getMonth() || newYear !== displayedMonth.getFullYear()) {
      setDisplayedMonth(middleDate)

      // Preserve selected date if it's in the new month
      if (selectedDate && !isSameMonth(selectedDate, middleDate)) {
        setSelectedDate(null)
      }
    }
  }

  // Calculate monthly totals
  const monthlyTotals = {
    totalDue: bills.reduce((sum, bill) => sum + Number(bill.amount), 0),
    totalPaid: events.filter(e => e.extendedProps.isPaid).reduce((sum, e) => {
      return sum + Number(e.extendedProps.bill.amount)
    }, 0),
  }
  const remaining = monthlyTotals.totalDue - monthlyTotals.totalPaid
  const progressPercent = monthlyTotals.totalDue > 0
    ? (monthlyTotals.totalPaid / monthlyTotals.totalDue) * 100
    : 0

  // Animate progress ring
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progressPercent)
    }, 100)
    return () => clearTimeout(timer)
  }, [progressPercent])

  // Custom event rendering with bill pills
  const renderEventContent = (eventInfo: EventContentArg) => {
    const date = eventInfo.event.start
    if (!date) return null

    // Get the SINGLE bill associated with THIS specific event
    // Each FullCalendar event represents ONE bill (extendedProps set in updateEvents)
    const bill = eventInfo.event.extendedProps.bill
    const isPaid = eventInfo.event.extendedProps.isPaid
    const amount = eventInfo.event.extendedProps.amount

    if (!bill) return null

    return (
      <div className="fc-daygrid-event-content p-1" onClick={(e) => e.stopPropagation()}>
        <BillPill
          key={bill.id}
          bill={bill}
          amount={amount}
          isPaid={isPaid}
          onClick={() => setSelectedBill(bill)}
        />
      </div>
    )
  }

  // Get selected bill's payment status
  const selectedBillIsPaid = useMemo(() => {
    if (!selectedBill) return false
    const monthStart = startOfMonth(displayedMonth)
    const monthEnd = endOfMonth(displayedMonth)
    return payments.some(p => {
      const paidAt = new Date(p.paid_at)
      return p.bill_id === selectedBill.id && paidAt >= monthStart && paidAt <= monthEnd
    })
  }, [selectedBill, payments, displayedMonth])

  // Get day agenda bills
  const dayAgendaBills = useMemo(() => {
    if (!selectedDate) return []
    return getBillsForDate(selectedDate).map(bill => ({
      bill,
      isPaid: bill.isPaid
    }))
  }, [selectedDate, bills, payments, displayedMonth])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className={`${spacing.sectionGap} pb-20 md:pb-0`}>
      {/* Header */}
      <PageHeader
        title="Calendar"
        subtitle="View your bills by due date"
      />

      {/* Monthly Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          label="Total Due"
          value={`$${monthlyTotals.totalDue.toFixed(2)}`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="Paid"
          value={`$${monthlyTotals.totalPaid.toFixed(2)}`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-emerald-500 to-green-500"
          variant="success"
        />
        <StatCard
          label="Remaining"
          value={`$${remaining.toFixed(2)}`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-amber-500 to-orange-500"
          variant={remaining > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Progress"
          value={`${Math.round(progressPercent)}%`}
          secondary={`${events.filter(e => e.extendedProps.isPaid).length}/${bills.length} paid`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          gradient="from-teal-500 to-cyan-500"
          variant={progressPercent === 100 ? 'success' : 'default'}
        />
      </div>

      {/* Calendar */}
      <div className={cn(glass.card, 'rounded-2xl p-6')}>
        {/* Custom Calendar Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrevMonth}
              disabled={isNavigating}
              variant="outline"
              size="icon"
              className="w-10 h-10"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <Button
              onClick={handleNextMonth}
              disabled={isNavigating}
              variant="outline"
              size="icon"
              className="w-10 h-10"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>

            <Button
              onClick={handleToday}
              disabled={isNavigating || isCurrentMonth}
              variant="outline"
              className="h-10"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Today
            </Button>
          </div>

          {/* Month Title */}
          <h2 className="text-xl font-semibold text-white tracking-tight">
            {format(displayedMonth, 'MMMM yyyy')}
          </h2>

          {/* Spacer for balance */}
          <div className="w-[168px] hidden lg:block" />
        </div>

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          datesSet={handleDatesSet}
          headerToolbar={false}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={false}
        />
      </div>

      {/* Day Agenda Panel/Modal */}
      <DayAgenda
        date={selectedDate}
        bills={dayAgendaBills}
        onClose={() => setSelectedDate(null)}
        onBillClick={(bill) => {
          setSelectedBill(bill)
          setSelectedDate(null)
        }}
        onMarkPaid={handleMarkPaid}
      />

      {/* Bill Detail Modal */}
      <BillDetailModal
        bill={selectedBill}
        isPaid={selectedBillIsPaid}
        onClose={() => setSelectedBill(null)}
        onMarkPaid={handleMarkPaid}
        onUndoPayment={handleUndoPayment}
        onDelete={handleDeleteBill}
      />
    </div>
  )
}
