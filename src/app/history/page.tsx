'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts'

type PaymentWithBill = Payment & {
  bill: Bill
}

const categoryColors: Record<string, string> = {
  Utilities: '#3b82f6',
  Subscriptions: '#8b5cf6',
  Insurance: '#22c55e',
  Housing: '#f97316',
  Transportation: '#eab308',
  Healthcare: '#ef4444',
  'Credit Cards': '#0ea5e9',
  'Food & Dining': '#ec4899',
  Entertainment: '#6366f1',
  Other: '#6b7280',
}

export default function HistoryPage() {
  const [payments, setPayments] = useState<PaymentWithBill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const supabase = createClient()

  // Generate last 12 months for dropdown
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i)
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy'),
    }
  })

  useEffect(() => {
    fetchData()
  }, [selectedMonth])

  async function fetchData() {
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthStart = startOfMonth(new Date(year, month - 1))
    const monthEnd = endOfMonth(new Date(year, month - 1))

    const [billsResult, paymentsResult] = await Promise.all([
      supabase.from('bills').select('*'),
      supabase
        .from('payments')
        .select('*')
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())
        .order('paid_at', { ascending: false })
    ])

    if (paymentsResult.data && billsResult.data) {
      const paymentsWithBills = paymentsResult.data.map(payment => ({
        ...payment,
        bill: billsResult.data.find(b => b.id === payment.bill_id) as Bill
      })).filter(p => p.bill)
      setPayments(paymentsWithBills)
    }

    setLoading(false)
  }

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0)

  const categoryTotals = payments.reduce((acc, p) => {
    const category = p.bill.category
    acc[category] = (acc[category] || 0) + Number(p.amount_paid)
    return acc
  }, {} as Record<string, number>)

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

  // Prepare chart data
  const chartData = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      name: category,
      amount: total,
      color: categoryColors[category] || categoryColors.Other,
    }))
    .sort((a, b) => b.amount - a.amount)

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Payment History</h1>
          <p className="text-zinc-400">Track your bill payments over time</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px] h-12 bg-white/5 border-white/10 text-white rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a24] border-white/10 text-white">
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Paid Card */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Total Paid</p>
              <p className="text-2xl font-bold text-teal-400">${totalPaid.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Bills Paid Card */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Bills Paid</p>
              <p className="text-2xl font-bold text-white">{payments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Spending Chart */}
      {chartData.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Spending by Category</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bar Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tickFormatter={(value) => `$${value}`}
                    stroke="#71717a"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#71717a"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                      color: '#f0f0f5',
                    }}
                    labelStyle={{ color: '#f0f0f5', fontWeight: 600 }}
                    itemStyle={{ color: '#14b8a6' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart */}
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="amount"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                      color: '#f0f0f5',
                    }}
                    itemStyle={{ color: '#14b8a6' }}
                    formatter={(value: number, name: string, props: { payload: { name: string } }) => [
                      `$${value.toFixed(2)}`,
                      props.payload.name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-white/5">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-zinc-400">{item.name}</span>
                <span className="text-sm font-medium text-white">${item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Payment Details</h2>
        </div>
        <div className="p-6">
          {payments.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-zinc-400">No payments recorded for this month</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] rounded-xl transition-colors"
                >
                  <div>
                    <p className="font-medium text-white">{payment.bill.name}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryClass(payment.bill.category)}`}>
                        {payment.bill.category}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {format(new Date(payment.paid_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-teal-400">
                      ${Number(payment.amount_paid).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
