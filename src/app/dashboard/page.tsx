'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Bill, Payment } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { toast } from 'sonner'
import {
  PageHeader,
  SectionHeader,
  StatCard,
  EmptyState,
  CategoryBadge,
  StatusBadge,
  spacing,
  typography,
} from '@/components/design-system'
import { AddBillModal } from '@/components/bills/add-bill-modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2, DollarSign, ChevronRight } from 'lucide-react'

type BillWithPaymentStatus = Bill & {
  isPaidThisMonth: boolean
}

// Helper for ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function DashboardPage() {
  const [bills, setBills] = useState<BillWithPaymentStatus[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [payingBillId, setPayingBillId] = useState<string | null>(null)
  const [undoingBillId, setUndoingBillId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmPaymentBill, setConfirmPaymentBill] = useState<Bill | null>(null)
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)
  const supabase = createClient()

  async function fetchData() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
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
        .lte('paid_at', monthEnd.toISOString()),
    ])

    if (billsResult.data) {
      const billsWithStatus = billsResult.data.map((bill) => ({
        ...bill,
        isPaidThisMonth:
          paymentsResult.data?.some((p) => p.bill_id === bill.id) || false,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleMarkPaid(bill: Bill) {
    // Check if payment amount is large (>$500)
    const amount = Number(bill.amount)
    if (amount > 500) {
      setConfirmPaymentBill(bill)
      return
    }

    await markBillAsPaid(bill)
  }

  async function markBillAsPaid(bill: Bill) {
    setPayingBillId(bill.id)

    const { data, error } = await supabase
      .from('payments')
      .insert({
        bill_id: bill.id,
        amount_paid: bill.amount,
      })
      .select('id')
      .single()

    if (!error && data) {
      await fetchData()
      toast.success(`${bill.name} marked as paid!`, {
        description: `$${Number(bill.amount).toFixed(2)} recorded`,
        action: {
          label: 'Undo',
          onClick: async () => {
            setUndoingBillId(bill.id)
            const { error: undoError } = await supabase
              .from('payments')
              .delete()
              .eq('id', data.id)

            if (!undoError) {
              toast.success(`Payment undone for ${bill.name}`)
              fetchData()
            } else {
              toast.error('Failed to undo payment')
            }
            setUndoingBillId(null)
          },
        },
      })
    } else {
      toast.error('Failed to mark as paid')
    }

    setPayingBillId(null)
  }

  async function handleUndoPayment(bill: Bill) {
    setUndoingBillId(bill.id)

    // Find and delete the most recent payment for this bill in the current month
    const payment = payments.find((p) => p.bill_id === bill.id)
    if (payment) {
      const { error } = await supabase.from('payments').delete().eq('id', payment.id)

      if (!error) {
        toast.success(`Payment undone for ${bill.name}`)
        await fetchData()
      } else {
        toast.error('Failed to undo payment')
      }
    }

    setUndoingBillId(null)
  }

  async function handleDeleteBill(bill: Bill) {
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

  const today = new Date().getDate()
  const upcomingBills = bills.filter((b) => b.due_day >= today && !b.isPaidThisMonth)
  const overdueBills = bills.filter((b) => b.due_day < today && !b.isPaidThisMonth)
  const paidBills = bills.filter((b) => b.isPaidThisMonth)

  const totalDue = bills
    .filter((b) => !b.isPaidThisMonth)
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

  // Empty state when no bills exist
  if (bills.length === 0) {
    return (
      <div className={spacing.sectionGap}>
        <PageHeader
          title="Dashboard"
          subtitle={format(new Date(), 'EEEE, MMMM d, yyyy')}
        />

        <EmptyState
          icon={
            <svg className="w-16 h-16 text-teal-400" viewBox="0 0 64 64" fill="none">
              {/* Bottom card */}
              <rect
                x="8"
                y="24"
                width="40"
                height="28"
                rx="4"
                fill="currentColor"
                fillOpacity="0.2"
                stroke="currentColor"
                strokeWidth="2"
              />
              {/* Middle card */}
              <rect
                x="12"
                y="18"
                width="40"
                height="28"
                rx="4"
                fill="currentColor"
                fillOpacity="0.3"
                stroke="currentColor"
                strokeWidth="2"
              />
              {/* Top card */}
              <rect
                x="16"
                y="12"
                width="40"
                height="28"
                rx="4"
                fill="currentColor"
                fillOpacity="0.4"
                stroke="currentColor"
                strokeWidth="2"
              />
              {/* Dollar sign */}
              <path
                d="M36 22v2m0 12v2m-4-12a4 4 0 014-4 4 4 0 014 4c0 2.5-3 3-4 4-1 1-4 1.5-4 4a4 4 0 004 4 4 4 0 004-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No bills yet"
          description="Add your first bill to start tracking payments and stay organized"
          action={{
            label: 'Add Your First Bill',
            onClick: () => setShowAddModal(true),
          }}
        />

        {/* Add Bill Modal */}
        <AddBillModal
          open={showAddModal}
          onOpenChange={setShowAddModal}
          editingBill={editingBill}
          onSuccess={fetchData}
        />
      </div>
    )
  }

  return (
    <div className={spacing.sectionGap}>
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle={format(new Date(), 'EEEE, MMMM d, yyyy')}
        actions={
          <Button
            onClick={() => {
              setEditingBill(null)
              setShowAddModal(true)
            }}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Bill
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total Bills"
          value={bills.length}
          icon={<BillsIcon />}
          gradient="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="Amount Due"
          value={`$${totalDue.toFixed(2)}`}
          icon={<DueIcon />}
          gradient="from-amber-500 to-orange-500"
          variant="warning"
        />
        <StatCard
          label="Paid This Month"
          value={`$${totalPaid.toFixed(2)}`}
          icon={<PaidIcon />}
          gradient="from-emerald-500 to-green-500"
          variant="success"
        />
        <StatCard
          label="Overdue"
          value={overdueBills.length}
          icon={<OverdueIcon />}
          gradient="from-rose-500 to-red-500"
          variant={overdueBills.length > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Bills Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overdue Bills */}
        {overdueBills.length > 0 && (
          <div className="glass-card rounded-2xl overflow-hidden border-rose-500/20">
            <SectionHeader
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              }
              label="Overdue Bills"
              count={overdueBills.length}
              variant="danger"
              className="bg-rose-500/5"
            />
            <div className="p-4 space-y-3">
              {overdueBills.map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  status="overdue"
                  onPay={handleMarkPaid}
                  isPaying={payingBillId === bill.id}
                  onEdit={() => {
                    setEditingBill(bill)
                    setShowAddModal(true)
                  }}
                  onDelete={() => setBillToDelete(bill)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Bills */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <SectionHeader
            icon={
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            }
            label="Upcoming Bills"
            actions={
              upcomingBills.length > 5 && (
                <Link href="/bills">
                  <Button variant="ghost" size="sm" className="text-teal-400 hover:text-teal-300 hover:bg-teal-500/10">
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )
            }
          />
          <div className="p-4 space-y-3">
            {upcomingBills.length === 0 ? (
              <EmptyState
                icon={
                  <svg
                    className="w-12 h-12 text-emerald-400"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <circle
                      cx="16"
                      cy="16"
                      r="12"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.2"
                    />
                    <path
                      d="M10 16l4 4 8-8"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
                title="All caught up!"
                description="No upcoming bills this month"
                variant="success"
              />
            ) : (
              upcomingBills.slice(0, 5).map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  status="upcoming"
                  onPay={handleMarkPaid}
                  isPaying={payingBillId === bill.id}
                  onEdit={() => {
                    setEditingBill(bill)
                    setShowAddModal(true)
                  }}
                  onDelete={() => setBillToDelete(bill)}
                />
              ))
            )}
          </div>
        </div>

        {/* Recently Paid */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <SectionHeader
            icon={
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
            label="Paid This Month"
            count={paidBills.length}
            variant="success"
          />
          <div className="p-4 space-y-3">
            {paidBills.length === 0 ? (
              <EmptyState
                icon={
                  <svg
                    className="w-12 h-12 text-zinc-500"
                    viewBox="0 0 32 32"
                    fill="none"
                  >
                    <ellipse
                      cx="16"
                      cy="22"
                      rx="10"
                      ry="4"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.1"
                    />
                    <ellipse
                      cx="16"
                      cy="18"
                      rx="10"
                      ry="4"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <ellipse
                      cx="16"
                      cy="14"
                      rx="10"
                      ry="4"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.2"
                    />
                    <path
                      d="M16 10v2m0 4v2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14 12.5a1.5 1.5 0 011.5-1.5h1a1.5 1.5 0 010 3h-1a1.5 1.5 0 000 3h1a1.5 1.5 0 001.5-1.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                }
                title="No payments yet"
                description="Mark bills as paid to track them here"
              />
            ) : (
              paidBills.map((bill) => (
                <BillItem
                  key={bill.id}
                  bill={bill}
                  status="paid"
                  onUndo={handleUndoPayment}
                  isUndoing={undoingBillId === bill.id}
                  onEdit={() => {
                    setEditingBill(bill)
                    setShowAddModal(true)
                  }}
                  onDelete={() => setBillToDelete(bill)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Bill Modal */}
      <AddBillModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        editingBill={editingBill}
        onSuccess={fetchData}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={billToDelete !== null}
        onOpenChange={(open) => !open && setBillToDelete(null)}
        title="Delete bill?"
        description={
          <>
            This will permanently remove{' '}
            <span className="font-medium text-white">&ldquo;{billToDelete?.name}&rdquo;</span>.
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loadingLabel="Deleting..."
        variant="danger"
        isLoading={isDeleting}
        onConfirm={async () => {
          if (billToDelete) {
            await handleDeleteBill(billToDelete)
          }
        }}
      />

      {/* Large Payment Confirmation Dialog */}
      <ConfirmDialog
        open={confirmPaymentBill !== null}
        onOpenChange={(open) => !open && setConfirmPaymentBill(null)}
        title="Confirm large payment"
        description={
          <>
            You&apos;re about to mark{' '}
            <span className="font-medium text-white">&ldquo;{confirmPaymentBill?.name}&rdquo;</span>{' '}
            as paid for{' '}
            <span className="font-medium text-emerald-400">
              ${Number(confirmPaymentBill?.amount || 0).toFixed(2)}
            </span>
            . Please confirm this payment.
          </>
        }
        confirmLabel="Mark as Paid"
        loadingLabel="Marking as paid..."
        variant="info"
        isLoading={isConfirmingPayment}
        icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
        onConfirm={async () => {
          if (confirmPaymentBill) {
            setIsConfirmingPayment(true)
            await markBillAsPaid(confirmPaymentBill)
            setIsConfirmingPayment(false)
            setConfirmPaymentBill(null)
          }
        }}
      />
    </div>
  )
}

function BillItem({
  bill,
  status,
  onPay,
  isPaying,
  onUndo,
  isUndoing,
  onEdit,
  onDelete,
}: {
  bill: Bill
  status: 'upcoming' | 'overdue' | 'paid'
  onPay?: (bill: Bill) => void
  isPaying?: boolean
  onUndo?: (bill: Bill) => void
  isUndoing?: boolean
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            status === 'paid'
              ? 'bg-emerald-500/20'
              : status === 'overdue'
                ? 'bg-rose-500/20'
                : 'bg-white/5'
          }`}
        >
          {status === 'paid' ? (
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : status === 'overdue' ? (
            <svg
              className="w-5 h-5 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${typography.body} text-white truncate`}>{bill.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <CategoryBadge category={bill.category} />
            <StatusBadge status={status} />
            <span className={`${typography.bodySmall} text-zinc-500`}>
              Due {getOrdinal(bill.due_day)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p
            className={`${typography.amountMedium} ${
              status === 'paid'
                ? 'text-emerald-400'
                : status === 'overdue'
                  ? 'text-rose-400'
                  : 'text-white'
            }`}
          >
            ${Number(bill.amount).toFixed(2)}
          </p>
        </div>

        {/* Kebab Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Bill actions"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-[#1a1a24] border-white/10 text-white"
          >
            {status !== 'paid' && onPay && (
              <>
                <DropdownMenuItem
                  onClick={() => onPay(bill)}
                  disabled={isPaying}
                  className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {isPaying ? 'Marking as paid...' : 'Mark as Paid'}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}
            {status === 'paid' && onUndo && (
              <>
                <DropdownMenuItem
                  onClick={() => onUndo(bill)}
                  disabled={isUndoing}
                  className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  {isUndoing ? 'Undoing...' : 'Undo Payment'}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}
            {onEdit && (
              <DropdownMenuItem
                onClick={onEdit}
                className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={onDelete}
                className="hover:bg-rose-500/10 focus:bg-rose-500/10 text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function BillsIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  )
}

function DueIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function PaidIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function OverdueIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  )
}
