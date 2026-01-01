'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Bill, BILL_CATEGORIES } from '@/lib/supabase'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
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
    fetchBills()
  }, [])

  async function fetchBills() {
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('is_active', true)
      .order('due_day', { ascending: true })

    if (data) {
      setBills(data)
    }
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

    if (editingBill) {
      await supabase
        .from('bills')
        .update(billData)
        .eq('id', editingBill.id)
    } else {
      await supabase.from('bills').insert(billData)
    }

    setSaving(false)
    setShowAddModal(false)
    resetForm()
    fetchBills()
  }

  const handleDelete = async (bill: Bill) => {
    if (!confirm(`Are you sure you want to delete "${bill.name}"?`)) return

    await supabase
      .from('bills')
      .update({ is_active: false })
      .eq('id', bill.id)

    fetchBills()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Bills</h1>
          <p className="text-zinc-400">Manage your recurring bills</p>
        </div>
        <Button
          onClick={openAddModal}
          className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl px-6 shadow-lg shadow-teal-500/20"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Bill
        </Button>
      </div>

      {bills.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-zinc-400 mb-6">No bills added yet. Start tracking your expenses!</p>
          <Button
            onClick={openAddModal}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold rounded-xl px-6"
          >
            Add Your First Bill
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white truncate">{bill.name}</h3>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getCategoryClass(bill.category)}`}>
                    {bill.category}
                  </span>
                </div>
                <div className="text-right ml-4">
                  <p className="text-2xl font-bold text-white">${Number(bill.amount).toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Due Day</span>
                  <span className="text-zinc-300">{bill.due_day}th of each month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Recurrence</span>
                  <span className="text-zinc-300 capitalize">{bill.recurrence}</span>
                </div>
              </div>

              {bill.notes && (
                <p className="text-sm text-zinc-500 pt-3 border-t border-white/5 mb-4 line-clamp-2">
                  {bill.notes}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-xl"
                  onClick={() => openEditModal(bill)}
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 text-rose-400 rounded-xl"
                  onClick={() => handleDelete(bill)}
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
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
              <Label htmlFor="name" className="text-zinc-300">Bill Name</Label>
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
                <Label htmlFor="amount" className="text-zinc-300">Amount ($)</Label>
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
                <Label htmlFor="due_day" className="text-zinc-300">Due Day</Label>
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
                <Label htmlFor="recurrence" className="text-zinc-300">Recurrence</Label>
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
                <Label htmlFor="category" className="text-zinc-300 flex items-center gap-2">
                  Category
                  {categorizing && (
                    <span className="text-xs text-teal-400 flex items-center gap-1">
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
              <Label htmlFor="notes" className="text-zinc-300">Notes (optional)</Label>
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
    </div>
  )
}
