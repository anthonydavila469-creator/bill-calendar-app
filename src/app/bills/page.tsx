'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Bill, Payment, BILL_CATEGORIES } from '@/lib/supabase'
import { categorizeBill } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog, confirmDialogPresets } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { startOfMonth, startOfDay, getDaysInMonth, addMonths, differenceInDays, format } from 'date-fns'
import { Clock, AlertTriangle, CheckCircle2, List, ChevronRight, MoreVertical, Pencil, Trash2, Calendar, Repeat, CreditCard, Sparkles, RotateCcw } from 'lucide-react'
import { BillsControlBar, type StatusFilter, type SortOption } from '@/components/bills'

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// Helper for ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Helper: Get the actual due date for a bill in a given month
// Handles months with fewer days (e.g., due_day=31 in February → last day of Feb)
function getDueDateThisMonth(bill: Bill, referenceDate: Date): Date {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const daysInMonth = getDaysInMonth(referenceDate)
  const actualDay = Math.min(bill.due_day, daysInMonth)
  return new Date(year, month, actualDay)
}

export default function BillsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [bills, setBills] = useState<Bill[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Read initial filter state from URL params
  const getInitialFilters = useCallback(() => {
    const category = searchParams.get('category')
    const status = searchParams.get('status') as StatusFilter | null
    const sort = searchParams.get('sort') as SortOption | null
    const search = searchParams.get('q')

    return {
      category: category || null,
      status: (status && ['all', 'upcoming', 'overdue', 'paid'].includes(status)) ? status : 'all',
      sort: (sort && ['due_day_asc', 'due_day_desc', 'amount_desc', 'amount_asc', 'name'].includes(sort)) ? sort : 'due_day_asc',
      search: search || '',
    }
  }, [searchParams])

  // Search and filter state (initialized from URL)
  const [searchQuery, setSearchQuery] = useState(() => getInitialFilters().search)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => getInitialFilters().category)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => getInitialFilters().status)
  const [sortBy, setSortBy] = useState<SortOption>(() => getInitialFilters().sort)
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

  // Sync filter state to URL params
  const updateUrlParams = useCallback((params: {
    category?: string | null
    status?: StatusFilter
    sort?: SortOption
    q?: string
  }) => {
    const current = new URLSearchParams(searchParams.toString())

    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === '' || value === 'all' || (key === 'sort' && value === 'due_day_asc')) {
        current.delete(key)
      } else {
        current.set(key, value)
      }
    })

    const newUrl = current.toString() ? `?${current.toString()}` : '/bills'
    router.replace(newUrl, { scroll: false })

    // Debug logging for testing
    if (process.env.NODE_ENV === 'development') {
      console.log('[BillsFilter] URL updated:', { params, url: newUrl })
    }
  }, [router, searchParams])

  const toggleDetails = (billId: string) => {
    setExpandedDetails(prev => {
      const next = new Set(prev)
      if (next.has(billId)) {
        next.delete(billId)
      } else {
        next.add(billId)
      }
      return next
    })
  }

  const [formData, setFormData] = useState<{
    name: string
    amount: string
    due_day: string
    recurrence: 'monthly' | 'weekly' | 'yearly' | 'once'
    category: string
    notes: string
  }>({
    name: '',
    amount: '',
    due_day: '',
    recurrence: 'monthly',
    category: 'Other',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const supabase = createClient()

  // Debounced search for smooth filtering
  const debouncedSearch = useDebounce(searchQuery, 200)

  // Debug logging for filter state (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[BillsFilter] State:', {
        status: statusFilter,
        category: selectedCategory,
        sort: sortBy,
        search: searchQuery,
        urlParams: Object.fromEntries(searchParams.entries()),
      })

      // Assertions for filter composition
      console.assert(
        typeof statusFilter === 'string' && ['all', 'upcoming', 'overdue', 'paid'].includes(statusFilter),
        'statusFilter should be a valid StatusFilter value'
      )
      console.assert(
        selectedCategory === null || typeof selectedCategory === 'string',
        'selectedCategory should be null or string'
      )
      console.assert(
        typeof sortBy === 'string' && ['due_day_asc', 'due_day_desc', 'amount_desc', 'amount_asc', 'name'].includes(sortBy),
        'sortBy should be a valid SortOption value'
      )
    }
  }, [statusFilter, selectedCategory, sortBy, searchQuery, searchParams])

  // Reactive "now" that updates periodically (handles midnight crossover)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  // Derived date boundaries
  const todayStart = useMemo(() => startOfDay(now), [now])
  const monthStart = useMemo(() => startOfMonth(now), [now])
  const monthStartNext = useMemo(() => addMonths(monthStart, 1), [monthStart])

  // Get paid bill IDs for current month (exclusive end boundary)
  const paidBillIds = useMemo(() => {
    const ids = new Set<string>()
    payments.forEach(p => {
      const paidAt = new Date(p.paid_at)
      // Check if payment is within current month [monthStart, monthStartNext)
      if (paidAt >= monthStart && paidAt < monthStartNext) {
        ids.add(p.bill_id)
      }
    })
    return ids
  }, [payments, monthStart, monthStartNext])

  // Compute status for each bill using proper date comparison
  const getBillStatus = useMemo(() => {
    return (bill: Bill): 'paid' | 'upcoming' | 'overdue' => {
      // Check if paid this month
      if (paidBillIds.has(bill.id)) return 'paid'

      // Get actual due date for this month (handles months with fewer days)
      const dueDate = getDueDateThisMonth(bill, now)

      // Overdue if due date is before start of today
      if (dueDate < todayStart) return 'overdue'

      return 'upcoming'
    }
  }, [paidBillIds, now, todayStart])

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: bills.length, upcoming: 0, overdue: 0, paid: 0 }
    bills.forEach(bill => {
      const status = getBillStatus(bill)
      counts[status]++
    })
    return counts
  }, [bills, getBillStatus])

  // Get category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    bills.forEach(bill => {
      counts[bill.category] = (counts[bill.category] || 0) + 1
    })
    return counts
  }, [bills])

  // Get last payment for a bill
  const getLastPayment = useCallback((billId: string): Payment | null => {
    const billPayments = payments.filter(p => p.bill_id === billId)
    if (billPayments.length === 0) return null
    return billPayments.sort((a, b) =>
      new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
    )[0]
  }, [payments])

  // Calculate next due date based on recurrence
  const getNextDueDate = useCallback((bill: Bill): Date => {
    const currentDue = getDueDateThisMonth(bill, now)
    if (currentDue >= todayStart && !paidBillIds.has(bill.id)) {
      return currentDue
    }
    // If already passed or paid, calculate next occurrence
    if (bill.recurrence === 'monthly') {
      return getDueDateThisMonth(bill, addMonths(now, 1))
    } else if (bill.recurrence === 'yearly') {
      const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), 1)
      return getDueDateThisMonth(bill, nextYear)
    } else if (bill.recurrence === 'weekly') {
      const nextWeek = new Date(now)
      nextWeek.setDate(nextWeek.getDate() + 7)
      return nextWeek
    }
    return currentDue
  }, [now, todayStart, paidBillIds])

  // Filter and sort bills
  const filteredBills = useMemo(() => {
    let result = [...bills]

    // Filter by status first
    if (statusFilter !== 'all') {
      result = result.filter(bill => getBillStatus(bill) === statusFilter)
    }

    // Filter by search query
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(bill =>
        bill.name.toLowerCase().includes(query) ||
        bill.category.toLowerCase().includes(query) ||
        bill.notes?.toLowerCase().includes(query)
      )
    }

    // Filter by category
    if (selectedCategory) {
      result = result.filter(bill => bill.category === selectedCategory)
    }

    // Sort
    switch (sortBy) {
      case 'due_day_asc':
        result.sort((a, b) => a.due_day - b.due_day)
        break
      case 'due_day_desc':
        result.sort((a, b) => b.due_day - a.due_day)
        break
      case 'amount_desc':
        result.sort((a, b) => Number(b.amount) - Number(a.amount))
        break
      case 'amount_asc':
        result.sort((a, b) => Number(a.amount) - Number(b.amount))
        break
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
    }

    return result
  }, [bills, debouncedSearch, selectedCategory, statusFilter, sortBy, getBillStatus])

  // Debounce bill name for AI categorization
  const debouncedBillName = useDebounce(formData.name, 500)

  // Auto-categorize when bill name changes (only for new bills)
  useEffect(() => {
    async function autoCategory() {
      if (!editingBill && debouncedBillName.length >= 3) {
        setCategorizing(true)
        const category = await categorizeBill(debouncedBillName)
        setFormData(prev => ({ ...prev, category }))
        setCategorizing(false)
      }
    }
    autoCategory()
  }, [debouncedBillName, editingBill])

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [billsResult, paymentsResult] = await Promise.all([
      supabase.from('bills').select('*').eq('is_active', true).order('due_day', { ascending: true }),
      supabase.from('payments').select('*')
    ])

    if (billsResult.data) setBills(billsResult.data)
    if (paymentsResult.data) setPayments(paymentsResult.data)
    setLoading(false)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      due_day: '',
      recurrence: 'monthly',
      category: 'Other',
      notes: '',
    })
    setEditingBill(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowAddModal(true)
  }

  const openEditModal = (bill: Bill) => {
    setFormData({
      name: bill.name,
      amount: String(bill.amount),
      due_day: String(bill.due_day),
      recurrence: bill.recurrence,
      category: bill.category,
      notes: bill.notes || '',
    })
    setEditingBill(bill)
    setShowAddModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const billData = {
      name: formData.name,
      amount: parseFloat(formData.amount),
      due_day: parseInt(formData.due_day),
      recurrence: formData.recurrence,
      category: formData.category,
      notes: formData.notes || null,
      user_id: user.id,
    }

    let error
    if (editingBill) {
      const result = await supabase
        .from('bills')
        .update(billData)
        .eq('id', editingBill.id)
      error = result.error
    } else {
      // Create bill via API endpoint (enforces subscription limits)
      const res = await fetch('/api/bills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.upgradeRequired) {
          // Show upgrade prompt
          toast.error(data.message, {
            action: {
              label: 'Upgrade to Pro',
              onClick: () => (window.location.href = '/pricing'),
            },
            duration: 10000,
          })
          setSaving(false)
          setShowAddModal(false)
          return
        }
        error = { message: data.error || 'Failed to create bill' }
      }
    }

    setSaving(false)

    if (error) {
      toast.error(editingBill ? 'Failed to update bill' : 'Failed to add bill')
      return
    }

    toast.success(editingBill ? `${formData.name} updated!` : `${formData.name} added!`)
    setShowAddModal(false)
    resetForm()
    fetchData()
  }

  const handleDelete = async (bill: Bill) => {
    setIsDeleting(true)

    const { error } = await supabase
      .from('bills')
      .update({ is_active: false })
      .eq('id', bill.id)

    setIsDeleting(false)
    setBillToDelete(null)

    if (error) {
      toast.error('Failed to delete bill')
      return
    }

    toast.success(`${bill.name} deleted`)
    fetchData()
  }

  // Filter change handlers that sync to URL
  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category)
    updateUrlParams({ category })

    // Debug logging for testing
    if (process.env.NODE_ENV === 'development') {
      console.log('[BillsFilter] Category changed:', category, '| Bills matching:',
        category ? bills.filter(b => b.category === category).length : bills.length)
    }
  }, [updateUrlParams, bills])

  const handleStatusChange = useCallback((status: StatusFilter) => {
    setStatusFilter(status)
    updateUrlParams({ status })
  }, [updateUrlParams])

  const handleSortChange = useCallback((sort: SortOption) => {
    setSortBy(sort)
    updateUrlParams({ sort })
  }, [updateUrlParams])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    // Only update URL when search is complete (on blur or enter)
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedCategory(null)
    setStatusFilter('all')
    setSortBy('due_day_asc')
    router.replace('/bills', { scroll: false })

    // Debug logging for testing
    if (process.env.NODE_ENV === 'development') {
      console.log('[BillsFilter] All filters cleared')
    }
  }, [router])

  const hasActiveFilters = Boolean(searchQuery || selectedCategory || statusFilter !== 'all' || sortBy !== 'due_day_asc')

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  // Active filters for category chips
  const activeCategories = Object.keys(categoryCounts)

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      {bills.length > 0 ? (
        <BillsControlBar
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
          statusCounts={statusCounts}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearch={(q) => updateUrlParams({ q })}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          categories={activeCategories}
          categoryCounts={categoryCounts}
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          onAddBill={openAddModal}
          onResetFilters={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
        />
      ) : (
        /* Simple header when no bills */
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-0.5">Bills</h1>
            <p className="text-sm text-zinc-400">Manage your recurring bills</p>
          </div>
          <Button
            onClick={openAddModal}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl px-5 h-10 shadow-lg shadow-teal-500/20 transition-all duration-300 hover:shadow-teal-500/40 hover:scale-[1.02]"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Bill
          </Button>
        </div>
      )}

      {bills.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />

          <div className="relative">
            {/* Animated illustration */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 rounded-3xl blur-xl animate-pulse" />
              <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-white/10 flex items-center justify-center">
                {/* Stack of bills illustration */}
                <svg className="w-16 h-16 text-teal-400" viewBox="0 0 64 64" fill="none">
                  {/* Bottom card */}
                  <rect x="8" y="24" width="40" height="28" rx="4" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2"/>
                  {/* Middle card */}
                  <rect x="12" y="18" width="40" height="28" rx="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2"/>
                  {/* Top card */}
                  <rect x="16" y="12" width="40" height="28" rx="4" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="2"/>
                  {/* Dollar sign */}
                  <path d="M36 22v2m0 12v2m-4-12a4 4 0 014-4 4 4 0 014 4c0 2.5-3 3-4 4-1 1-4 1.5-4 4a4 4 0 004 4 4 4 0 004-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              {/* Floating elements */}
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '2s' }}>
                <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">Start Tracking Your Bills</h3>
            <p className="text-sm text-zinc-400 mb-8 max-w-md mx-auto leading-relaxed">
              Add your first bill to begin organizing your finances. We&apos;ll help you stay on top of due dates and never miss a payment.
            </p>

            <Button
              onClick={openAddModal}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl px-8 py-3 h-auto shadow-lg shadow-teal-500/25 transition-all duration-300 hover:shadow-teal-500/40 hover:scale-105"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Your First Bill
            </Button>
          </div>
        </div>
      ) : filteredBills.length === 0 ? (
        /* Filter-specific Empty States */
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className={`absolute inset-0 rounded-2xl blur-xl ${
              statusFilter === 'overdue' ? 'bg-rose-500/20' :
              statusFilter === 'paid' ? 'bg-teal-500/20' :
              statusFilter === 'upcoming' ? 'bg-amber-500/20' :
              'bg-zinc-500/20'
            }`} />
            <div className="relative w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
              {statusFilter === 'overdue' ? (
                <AlertTriangle className="w-8 h-8 text-rose-400" />
              ) : statusFilter === 'paid' ? (
                <CheckCircle2 className="w-8 h-8 text-teal-400" />
              ) : statusFilter === 'upcoming' ? (
                <Clock className="w-8 h-8 text-amber-400" />
              ) : searchQuery ? (
                <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              ) : (
                <List className="w-8 h-8 text-zinc-500" />
              )}
            </div>
          </div>

          {/* Filter-specific messaging - section-title + body-muted */}
          {statusFilter === 'overdue' ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No overdue bills</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Great job! All your bills are either paid or upcoming. Keep up the good work.
              </p>
            </>
          ) : statusFilter === 'paid' ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No paid bills this month</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Mark bills as paid when you complete them to track your progress.
              </p>
            </>
          ) : statusFilter === 'upcoming' ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No upcoming bills</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                All bills for this period have either been paid or are overdue.
              </p>
            </>
          ) : searchQuery ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No results for &ldquo;{searchQuery}&rdquo;</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Try a different search term or clear filters to see all bills.
              </p>
            </>
          ) : selectedCategory ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No {selectedCategory} bills</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Add a bill in this category or select a different category filter.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-white mb-2">No bills found</h3>
              <p className="text-sm text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Adjust your filters or add a new bill to get started.
              </p>
            </>
          )}

          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={clearAllFilters}
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Clear Filters
            </Button>
            {(statusFilter === 'paid' || selectedCategory) && (
              <Button
                onClick={openAddModal}
                size="sm"
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-medium rounded-lg"
              >
                Add Bill
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Results Counter */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>
                Showing <span className="text-white font-medium">{filteredBills.length}</span> of{' '}
                <span className="text-white font-medium">{bills.length}</span> bills
              </span>
              <button
                onClick={clearAllFilters}
                className="text-teal-400 hover:text-teal-300 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Bill List - Optimized for fast scanning */}
          <div className="space-y-2">
            {filteredBills.map((bill) => {
              const billStatus = getBillStatus(bill)
              const dueDate = getDueDateThisMonth(bill, now)
              const overdueDays = billStatus === 'overdue' ? differenceInDays(todayStart, dueDate) : 0
              const daysUntilDue = billStatus === 'upcoming' ? differenceInDays(dueDate, todayStart) : 0
              const isExpanded = expandedDetails.has(bill.id)
              const lastPayment = getLastPayment(bill.id)
              const nextDue = getNextDueDate(bill)

              return (
                <div
                  key={bill.id}
                  className={`glass-card rounded-xl border border-white/[0.06] transition-all duration-200 ${
                    billStatus === 'paid'
                      ? 'border-l-2 border-l-teal-500/50'
                      : billStatus === 'overdue'
                      ? 'border-l-2 border-l-rose-500/50'
                      : ''
                  }`}
                >
                  {/* Main Row - Click to expand */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Left: Name + Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-white leading-snug truncate">
                          {bill.name}
                        </h3>
                        {/* Status badges - text-[11px] for badge text */}
                        {billStatus === 'paid' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-teal-500/15 text-teal-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Paid
                          </span>
                        )}
                        {billStatus === 'overdue' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400">
                            <AlertTriangle className="w-3 h-3" />
                            {overdueDays}d overdue
                          </span>
                        )}
                        {billStatus === 'upcoming' && daysUntilDue <= 3 && daysUntilDue > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400">
                            <Clock className="w-3 h-3" />
                            {daysUntilDue === 1 ? 'Tomorrow' : `${daysUntilDue}d`}
                          </span>
                        )}
                        {bill.notes && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-violet-500/15 text-violet-400">
                            <Sparkles className="w-3 h-3" />
                            Auto
                          </span>
                        )}
                      </div>
                      {/* Meta line - text-xs for caption, text-[11px] for category badge */}
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getCategoryClass(bill.category)}`}>
                          {bill.category}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span>Due {getOrdinal(bill.due_day)}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="capitalize">{bill.recurrence}</span>
                      </div>
                    </div>

                    {/* Right: Amount + Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Amount */}
                      <p className="text-lg font-semibold text-white tabular-nums">
                        ${Number(bill.amount).toFixed(2)}
                      </p>

                      {/* Expand/Collapse Chevron */}
                      <button
                        onClick={() => toggleDetails(bill.id)}
                        className={`p-1.5 rounded-lg transition-all duration-200 ${
                          isExpanded
                            ? 'bg-teal-500/20 text-teal-400'
                            : 'text-zinc-500 hover:text-white hover:bg-white/10'
                        }`}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {/* Kebab Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Bill actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-40 bg-[#1a1a24] border-white/10"
                        >
                          <DropdownMenuItem
                            onClick={() => openEditModal(bill)}
                            className="text-zinc-300 hover:text-white focus:text-white cursor-pointer"
                          >
                            <Pencil className="w-4 h-4 mr-2 text-zinc-500" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem
                            onClick={() => setBillToDelete(bill)}
                            className="text-rose-400 hover:text-rose-300 focus:text-rose-300 focus:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Expandable Details Panel */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t border-white/[0.06] pt-3">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Next Due */}
                          <div className="flex items-start gap-2.5">
                            <Calendar className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-zinc-500 mb-0.5">Next Due</p>
                              <p className="text-sm text-zinc-300 font-medium">
                                {format(nextDue, 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>

                          {/* Recurrence */}
                          <div className="flex items-start gap-2.5">
                            <Repeat className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-zinc-500 mb-0.5">Frequency</p>
                              <p className="text-sm text-zinc-300 font-medium capitalize">{bill.recurrence}</p>
                            </div>
                          </div>

                          {/* Last Payment */}
                          <div className="flex items-start gap-2.5">
                            <CreditCard className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-zinc-500 mb-0.5">Last Payment</p>
                              <p className="text-sm text-zinc-300 font-medium">
                                {lastPayment
                                  ? `${format(new Date(lastPayment.paid_at), 'MMM d')} · $${Number(lastPayment.amount_paid).toFixed(2)}`
                                  : 'No payments yet'}
                              </p>
                            </div>
                          </div>

                          {/* Notes / Auto-detection source */}
                          {bill.notes && (
                            <div className="flex items-start gap-2.5 col-span-2">
                              <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-zinc-500 mb-0.5">Auto-detected from</p>
                                <p className="text-sm text-zinc-300 font-medium line-clamp-2">
                                  {bill.notes.split('\n')[0] || 'Email'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Ghost card hint when few bills */}
            {filteredBills.length > 0 && filteredBills.length < 6 && (
              <div className="glass-card rounded-xl p-4 border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center text-center min-h-[120px] opacity-60 hover:opacity-80 transition-opacity">
                <p className="text-xs text-zinc-500 mb-3 max-w-[160px] leading-relaxed">
                  Tip: Add more bills to keep your month accurate
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 bg-white/5 border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-medium rounded-lg"
                  onClick={() => setShowAddModal(true)}
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Bill
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add/Edit Bill Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#12121a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingBill ? 'Edit Bill' : 'Add New Bill'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-zinc-300">Bill Name</Label>
              <Input
                id="name"
                placeholder="e.g., Netflix, Electricity"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl focus:border-teal-500/50 focus:ring-teal-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm font-medium text-zinc-300">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl focus:border-teal-500/50 focus:ring-teal-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_day" className="text-sm font-medium text-zinc-300">Due Day</Label>
                <Input
                  id="due_day"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="1-31"
                  value={formData.due_day}
                  onChange={(e) => setFormData({ ...formData, due_day: e.target.value })}
                  required
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl focus:border-teal-500/50 focus:ring-teal-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recurrence" className="text-sm font-medium text-zinc-300">Recurrence</Label>
                <Select
                  value={formData.recurrence}
                  onValueChange={(value) => setFormData({ ...formData, recurrence: value as Bill['recurrence'] })}
                >
                  <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10 text-white">
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="once">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  Category
                  {categorizing && (
                    <span className="text-xs text-teal-400 font-normal flex items-center gap-1">
                      <span className="animate-spin h-3 w-3 border border-teal-400 border-t-transparent rounded-full"></span>
                      AI suggesting...
                    </span>
                  )}
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10 text-white">
                    {BILL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium text-zinc-300">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl focus:border-teal-500/50 focus:ring-teal-500/20"
              />
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl"
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Saving...
                  </div>
                ) : editingBill ? 'Update Bill' : 'Add Bill'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={billToDelete !== null}
        onOpenChange={(open) => !open && setBillToDelete(null)}
        {...confirmDialogPresets.deleteBill(billToDelete?.name || '')}
        isLoading={isDeleting}
        onConfirm={async () => {
          if (billToDelete) {
            await handleDelete(billToDelete)
          }
        }}
      />
    </div>
  )
}
