'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
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
  Legend,
} from 'recharts'
import {
  PageHeader,
  StatCard,
  EmptyState,
  spacing,
  glass,
  typography,
} from '@/components/design-system'
import { HistoryControlBar } from '@/components/history/history-control-bar'
import { PaymentList } from '@/components/history/payment-list'
import { cn } from '@/lib/utils'
import { Lock, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canAccessAnalytics } from '@/lib/subscription'
import { getCategoryColor } from '@/components/design-system'

type PaymentWithBill = Payment & {
  bill: Bill
}

export default function HistoryPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<PaymentWithBill[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'pro'>('free')

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
    setLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthStart = startOfMonth(new Date(year, month - 1))
    const monthEnd = endOfMonth(new Date(year, month - 1))

    // Fetch user's subscription tier
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .single()

      setSubscriptionTier((prefs?.subscription_tier || 'free') as 'free' | 'pro')
    }

    const [billsResult, paymentsResult] = await Promise.all([
      supabase.from('bills').select('*'),
      supabase
        .from('payments')
        .select('*')
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())
        .order('paid_at', { ascending: false }),
    ])

    if (paymentsResult.data && billsResult.data) {
      const paymentsWithBills = paymentsResult.data
        .map((payment) => ({
          ...payment,
          bill: billsResult.data.find((b) => b.id === payment.bill_id) as Bill,
        }))
        .filter((p) => p.bill)
      setPayments(paymentsWithBills)
    }

    setLoading(false)
  }

  // Filtered payments
  const filteredPayments = useMemo(() => {
    let filtered = payments

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter((p) => p.bill.category === selectedCategory)
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((p) =>
        p.bill.name.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [payments, selectedCategory, searchQuery])

  // Statistics
  const stats = useMemo(() => {
    const totalPaid = filteredPayments.reduce(
      (sum, p) => sum + Number(p.amount_paid),
      0
    )
    const billsPaid = filteredPayments.length
    const avgBill = billsPaid > 0 ? totalPaid / billsPaid : 0
    const largestBill = filteredPayments.length > 0
      ? Math.max(...filteredPayments.map((p) => Number(p.amount_paid)))
      : 0

    return { totalPaid, billsPaid, avgBill, largestBill }
  }, [filteredPayments])

  // Category breakdown
  const categoryData = useMemo(() => {
    const categoryTotals = filteredPayments.reduce((acc, p) => {
      const category = p.bill.category
      acc[category] = (acc[category] || 0) + Number(p.amount_paid)
      return acc
    }, {} as Record<string, number>)

    return Object.entries(categoryTotals)
      .map(([category, total]) => ({
        name: category,
        amount: total,
        color: getCategoryColor(category),
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [filteredPayments])

  // Get unique categories and counts
  const categories = useMemo(() => {
    return Array.from(new Set(payments.map((p) => p.bill.category))).sort()
  }, [payments])

  const categoryCounts = useMemo(() => {
    return payments.reduce((acc, p) => {
      const category = p.bill.category
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [payments])

  const hasActiveFilters = selectedCategory !== null || searchQuery.trim() !== ''

  const handleResetFilters = () => {
    setSelectedCategory(null)
    setSearchQuery('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={`${spacing.sectionGap} pb-20 md:pb-0`}>
      {/* Page Header */}
      <PageHeader
        title="Payment History"
        subtitle="Track your bill payments and analyze spending patterns"
      />

      {/* Control Bar */}
      <HistoryControlBar
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        monthOptions={months}
        categories={categories}
        categoryCounts={categoryCounts}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onResetFilters={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Stats Grid */}
      {payments.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Paid"
            value={`$${stats.totalPaid.toFixed(2)}`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            gradient="from-teal-500 to-cyan-500"
            variant="success"
          />
          <StatCard
            label="Bills Paid"
            value={stats.billsPaid.toString()}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
            gradient="from-violet-500 to-purple-500"
          />
          <StatCard
            label="Avg Bill"
            value={`$${stats.avgBill.toFixed(2)}`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            gradient="from-blue-500 to-indigo-500"
          />
          <StatCard
            label="Largest Bill"
            value={`$${stats.largestBill.toFixed(2)}`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
            gradient="from-orange-500 to-red-500"
          />
        </div>
      )}

      {/* Charts - Pro Only */}
      {categoryData.length > 0 && (
        canAccessAnalytics(subscriptionTier) ? (
          <div className={cn(glass.card, 'rounded-2xl p-6')}>
            <h2 className={cn(typography.sectionTitle, 'mb-6')}>
              Spending by Category
            </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Bar Chart */}
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryData}
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
                    stroke="#a1a1aa"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      color: '#f4f4f5',
                      padding: '12px',
                    }}
                    labelStyle={{ color: '#f4f4f5', fontWeight: 600, marginBottom: '4px' }}
                    itemStyle={{ color: '#14b8a6', fontSize: '14px' }}
                    formatter={(value: number | undefined) =>
                      value !== undefined ? [`$${value.toFixed(2)}`, 'Amount'] : ['$0.00', 'Amount']
                    }
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart */}
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="amount"
                    label={({ name, percent }) =>
                      percent !== undefined ? `${name} ${(percent * 100).toFixed(0)}%` : name
                    }
                    labelLine={{ stroke: '#52525b', strokeWidth: 1 }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a24',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      color: '#f4f4f5',
                      padding: '12px',
                    }}
                    itemStyle={{ color: '#14b8a6', fontSize: '14px' }}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value !== undefined ? `$${value.toFixed(2)}` : '$0.00',
                      name || '',
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{
                      fontSize: '13px',
                      color: '#a1a1aa',
                      paddingTop: '16px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        ) : (
          <div className={cn(glass.card, 'rounded-2xl p-12 border-amber-500/20')}>
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
                <Lock className="w-10 h-10 text-amber-400" />
              </div>
              <h3 className={cn(typography.sectionTitle, 'mb-2')}>
                Unlock Spending Analytics
              </h3>
              <p className={cn(typography.body, 'text-zinc-400 mb-6 max-w-md mx-auto')}>
                Upgrade to Pro to visualize your spending patterns with interactive charts and category breakdowns
              </p>
              <Button
                onClick={() => (window.location.href = '/pricing')}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-semibold shadow-lg shadow-amber-500/50"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Pro
              </Button>
            </div>
          </div>
        )
      )}

      {/* Payment List */}
      {filteredPayments.length > 0 ? (
        <div className={cn(glass.card, 'rounded-2xl p-6')}>
          <h2 className={cn(typography.sectionTitle, 'mb-6')}>Payment Details</h2>
          <PaymentList payments={filteredPayments} groupByDay={true} />
        </div>
      ) : payments.length > 0 ? (
        <div className={cn(glass.card, 'rounded-2xl p-12')}>
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            title="No matching payments"
            description="Try adjusting your filters to see more results"
            variant="info"
          />
        </div>
      ) : (
        <div className={cn(glass.card, 'rounded-2xl p-12')}>
          <EmptyState
            icon={
              <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" stroke="currentColor">
                <rect x="6" y="10" width="36" height="32" rx="4" strokeWidth="2" fillOpacity="0.1" />
                <rect x="6" y="10" width="36" height="10" rx="4" strokeWidth="2" fillOpacity="0.2" />
                <path d="M16 6v8M32 6v8" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="30" r="8" strokeWidth="2" strokeDasharray="4 4" fillOpacity="0" />
              </svg>
            }
            title="No payments this month"
            description="Mark bills as paid to start tracking your spending history"
            variant="default"
            action={{
              label: 'Go to Bills',
              onClick: () => router.push('/bills'),
            }}
          />
        </div>
      )}
    </div>
  )
}
