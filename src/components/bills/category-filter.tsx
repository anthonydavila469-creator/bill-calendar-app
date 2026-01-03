'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryFilterProps {
  categories: string[]
  counts: Record<string, number>
  selected: string | null
  totalCount: number
  onChange: (category: string | null) => void
  className?: string
}

const categoryColors: Record<string, string> = {
  Utilities: '#3b82f6',
  Subscriptions: '#8b5cf6',
  Insurance: '#10b981',
  Housing: '#f59e0b',
  Transportation: '#ef4444',
  Healthcare: '#ec4899',
  'Credit Cards': '#6366f1',
  'Food & Dining': '#f97316',
  Entertainment: '#14b8a6',
  Other: '#71717a',
}

export function CategoryFilter({
  categories,
  counts,
  selected,
  totalCount,
  onChange,
  className,
}: CategoryFilterProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Wrapping chips container - wraps on mobile, scrolls on desktop */}
      <div
        className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:overflow-x-auto sm:pb-1 sm:-mb-1 scrollbar-hide"
        role="listbox"
        aria-label="Filter by category"
      >
        {/* All chip */}
        <button
          onClick={() => onChange(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onChange(null)
            }
          }}
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900',
            selected === null
              ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black shadow-lg shadow-teal-500/25'
              : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 active:scale-95'
          )}
          role="option"
          aria-selected={selected === null}
        >
          <span>All</span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
              selected === null ? 'bg-black/20 text-black' : 'bg-white/10 text-zinc-500'
            )}
          >
            {totalCount}
          </span>
        </button>

        {/* Category chips */}
        {categories.map((category) => {
          const isSelected = selected === category
          const count = counts[category] || 0
          const color = categoryColors[category] || categoryColors.Other

          return (
            <button
              key={category}
              onClick={() => onChange(isSelected ? null : category)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onChange(isSelected ? null : category)
                }
              }}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                'transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900',
                isSelected
                  ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-400 border border-teal-500/40 shadow-md shadow-teal-500/10'
                  : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 active:scale-95'
              )}
              role="option"
              aria-selected={isSelected}
            >
              {/* Color dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span>{category}</span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                  isSelected ? 'bg-teal-500/30 text-teal-300' : 'bg-white/10 text-zinc-500'
                )}
              >
                {count}
              </span>
              {isSelected && (
                <X className="w-3 h-3 ml-0.5 text-teal-400 hover:text-teal-300" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
