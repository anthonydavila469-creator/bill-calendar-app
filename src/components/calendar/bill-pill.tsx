import { cn } from '@/lib/utils'
import { getCategoryColor } from '@/components/design-system'
import { Bill } from '@/lib/supabase'

interface BillPillProps {
  bill: Bill
  amount: number
  isPaid: boolean
  onClick?: () => void
  className?: string
}

/**
 * BillPill - Compact bill display for calendar day cells
 * Shows category dot, truncated name, and amount
 * Mobile-optimized: Shows colored bar with amount and checkmark only on small screens
 */
export function BillPill({ bill, amount, isPaid, onClick, className }: BillPillProps) {
  const categoryColor = getCategoryColor(bill.category)
  const formattedAmount = `$${amount.toFixed(0)}`

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-1.5 rounded-md',
        'text-left transition-all duration-150',
        'px-2 py-1.5 md:px-2 md:py-1.5',
        // Mobile: Smaller padding, compact display
        'px-1.5 py-1',
        isPaid
          ? 'bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30'
          : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50',
        'active:scale-[0.98]',
        className
      )}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: isPaid ? '#14b8a6' : categoryColor,
      }}
    >
      {/* Category color dot - hidden on mobile, shown on desktop */}
      <div
        className="w-2 h-2 rounded-full shrink-0 hidden md:block"
        style={{ backgroundColor: isPaid ? '#14b8a6' : categoryColor }}
      />

      {/* Bill name - hidden on mobile, shown on desktop */}
      <span
        className={cn(
          'flex-1 text-xs font-medium truncate hidden md:inline',
          isPaid ? 'text-teal-300' : 'text-zinc-300'
        )}
        title={bill.name}
      >
        {bill.name}
      </span>

      {/* Mobile: Show first 2 letters of name */}
      <span
        className={cn(
          'text-[10px] font-bold uppercase shrink-0 md:hidden',
          isPaid ? 'text-teal-300' : 'text-zinc-400'
        )}
        title={bill.name}
      >
        {bill.name.slice(0, 2)}
      </span>

      {/* Amount */}
      <span
        className={cn(
          'text-xs md:text-xs font-bold tabular-nums shrink-0 flex-1 md:flex-none',
          isPaid ? 'text-teal-400' : 'text-white'
        )}
      >
        {formattedAmount}
      </span>

      {/* Paid checkmark */}
      {isPaid && (
        <svg className="w-3 h-3 md:w-3 md:h-3 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

interface MoreBillsButtonProps {
  count: number
  onClick: () => void
  className?: string
}

/**
 * MoreBillsButton - Shows "+N more" when there are additional bills
 */
export function MoreBillsButton({ count, onClick, className }: MoreBillsButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-2 py-1.5 rounded-md',
        'text-xs font-medium text-teal-400',
        'bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 hover:border-teal-500/30',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50',
        className
      )}
    >
      +{count} more
    </button>
  )
}
