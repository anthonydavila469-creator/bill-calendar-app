'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { format, startOfMonth, endOfMonth } from 'date-fns'

type BillWithPaymentStatus = Bill & {
  isPaidThisMonth: boolean
}

const categoryStyles: Record<string, string> = {
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

export default function DashboardPage() {
  const [bills, setBills] = useState<BillWithPaymentStatus[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [payingBillId, setPayingBillId] = useState<string | null>(null)
  const [undoingBillId, setUndoingBillId] = useState<string | null>(null)
  const supabase = createClient()

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const monthStart = startOfMonth(new Date())
    const monthEnd = endOfMonth(new Date())

    const [billsResult, paymentsResult] = await Promise.all([
      supabase
        .from('bills')
        .select('*')
        .eq('is_active', true)
        .order('due_day', { ascending: true }),
      supabase
        .from('payments')
        .select('*')
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())
    ])

    if (billsResult.data) {
      const billsWithStatus = billsResult.data.map(bill => ({
        ...bill,
        isPaidThisMonth: paymentsResult.data?.some(p => p.bill_id === bill.id) || false
      }))
      setBills(billsWithStatus)
    }

    if (paymentsResult.data) {
      setPayments(paymentsResult.data)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [supabase])

  async function handleMarkPaid(bill: Bill) {
    setPayingBillId(bill.id)

    const { error } = await supabase.from('payments').insert({
      bill_id: bill.id,
      amount_paid: bill.amount,
    })

    if (!error) {
      await fetchData()
    }

    setPayingBillId(null)
  }

  async function handleUndoPayment(bill: Bill) {
    setUndoingBillId(bill.id)

    // Find and delete the most recent payment for this bill in the current month
    const payment = payments.find(p => p.bill_id === bill.id)
    if (payment) {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id)

      if (!error) {
        await fetchData()
      }
    }

    setUndoingBillId(null)
  }

  const today = new Date().getDate()
  const upcomingBills = bills.filter(b => b.due_day >= today && !b.isPaidThisMonth)
  const overdueBills = bills.filter(b => b.due_day < today && !b.isPaidThisMonth)
  const paidBills = bills.filter(b => b.isPaidThisMonth)

  const totalDue = bills
    .filter(b => !b.isPaidThisMonth)
    .reduce((sum, b) => sum + Number(b.amount), 0)

  const totalPaid = paidBills.reduce((sum, b) => sum + Number(b.amount), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-teal-500/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-teal-500 animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-zinc-400">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Link href="/bills">
          <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Bill
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total Bills"
          value={bills.length.toString()}
          icon={<BillsIcon />}
          gradient="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="Amount Due"
          value={`$${totalDue.toFixed(2)}`}
          icon={<DueIcon />}
          gradient="from-amber-500 to-orange-500"
          highlight="warning"
        />
        <StatCard
          label="Paid This Month"
          value={`$${totalPaid.toFixed(2)}`}
          icon={<PaidIcon />}
          gradient="from-emerald-500 to-green-500"
          highlight="success"
        />
        <StatCard
          label="Overdue"
          value={overdueBills.length.toString()}
          icon={<OverdueIcon />}
          gradient="from-rose-500 to-red-500"
          highlight={overdueBills.length > 0 ? "danger" : undefined}
        />
      </div>

      {/* Bills Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overdue Bills */}
        {overdueBills.length > 0 && (
          <div className="glass-card rounded-2xl overflow-hidden border-rose-500/20">
            <div className="px-6 py-4 border-b border-white/5 bg-rose-500/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-rose-400">Overdue Bills</h2>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-medium">
                  {overdueBills.length}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {overdueBills.map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  status="overdue"
                  onPay={handleMarkPaid}
                  isPaying={payingBillId === bill.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Bills */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Upcoming Bills</h2>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 text-xs font-medium">
                {upcomingBills.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {upcomingBills.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-zinc-500">All caught up this month!</p>
              </div>
            ) : (
              <>
                {upcomingBills.slice(0, 5).map((bill) => (
                  <BillItem
                    key={bill.id}
                    bill={bill}
                    status="upcoming"
                    onPay={handleMarkPaid}
                    isPaying={payingBillId === bill.id}
                  />
                ))}
                {upcomingBills.length > 5 && (
                  <Link href="/bills" className="block text-center text-sm text-teal-400 hover:text-teal-300 pt-2">
                    View all {upcomingBills.length} bills →
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Recently Paid */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Paid This Month</h2>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                {paidBills.length}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {paidBills.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-zinc-500">No bills paid yet this month</p>
              </div>
            ) : (
              paidBills.map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  status="paid"
                  onUndo={handleUndoPayment}
                  isUndoing={undoingBillId === bill.id}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, gradient, highlight }: {
  label: string
  value: string
  icon: React.ReactNode
  gradient: string
  highlight?: 'success' | 'warning' | 'danger'
}) {
  const highlightStyles = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-rose-400',
  }

  return (
    <div className="glass-card glass-card-hover rounded-2xl p-6 stat-card">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg`}>
          {icon}
        </div>
      </div>
      <p className="text-sm text-zinc-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? highlightStyles[highlight] : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function BillItem({ bill, status, onPay, isPaying, onUndo, isUndoing }: {
  bill: Bill
  status: 'upcoming' | 'overdue' | 'paid'
  onPay?: (bill: Bill) => void
  isPaying?: boolean
  onUndo?: (bill: Bill) => void
  isUndoing?: boolean
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          status === 'paid' ? 'bg-emerald-500/20' :
          status === 'overdue' ? 'bg-rose-500/20' :
          'bg-white/5'
        }`}>
          {status === 'paid' ? (
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : status === 'overdue' ? (
            <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div>
          <p className="font-medium text-white">{bill.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${categoryStyles[bill.category] || categoryStyles.Other}`}>
              {bill.category}
            </span>
            <span className="text-xs text-zinc-500">Due {bill.due_day}th</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {status !== 'paid' && onPay && (
          <button
            onClick={() => onPay(bill)}
            disabled={isPaying}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              status === 'overdue'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-white/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPaying ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Paying...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Pay
              </span>
            )}
          </button>
        )}
        {status === 'paid' && onUndo && (
          <button
            onClick={() => onUndo(bill)}
            disabled={isUndoing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUndoing ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Undoing...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Undo
              </span>
            )}
          </button>
        )}
        <div className="text-right">
          <p className={`text-lg font-semibold ${
            status === 'paid' ? 'text-emerald-400' :
            status === 'overdue' ? 'text-rose-400' :
            'text-white'
          }`}>
            ${Number(bill.amount).toFixed(2)}
          </p>
          {status === 'paid' && (
            <span className="text-xs text-emerald-400/70">Paid</span>
          )}
        </div>
      </div>
    </div>
  )
}

function BillsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function DueIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function PaidIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function OverdueIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}
