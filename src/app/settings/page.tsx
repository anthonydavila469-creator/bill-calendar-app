'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ConfirmDialog, confirmDialogPresets } from '@/components/ui/confirm-dialog'
import { PageHeader, spacing, typography } from '@/components/design-system'
import { Mail, Calendar, Trash2, RefreshCw, Zap, AlertTriangle, Bell, Link2, Database, Crown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface Preferences {
  reminder_enabled: boolean
  reminder_days: number[]
  gmail_sync_enabled: boolean
  google_connected: boolean
  google_calendar_id: string
  last_gmail_sync: string | null
  email: string | null
  subscription_tier?: 'free' | 'pro'
  subscription_status?: string | null
  subscription_current_period_end?: string | null
}

const REMINDER_OPTIONS = [
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
  { value: 14, label: '14 days before' },
]

/**
 * Format last sync timestamp with relative or absolute time
 *
 * Formatting strategy:
 * - < 1 min: "just now"
 * - < 1 hour: "X minutes ago"
 * - < 24 hours: "X hours ago"
 * - < 7 days: "X days ago"
 * - >= 7 days: "Jan 2, 2026 • 3:14 PM" (locale-aware)
 *
 * Hover tooltip always shows full timestamp: "Thursday, January 2, 2026 at 3:14:25 PM PST"
 *
 * @param timestamp - ISO 8601 timestamp string or null/undefined
 * @returns Object with display text and optional tooltip
 */
function formatLastSync(timestamp: string | null | undefined): {
  display: string
  tooltip: string | null
} {
  if (!timestamp) {
    return { display: 'never', tooltip: null }
  }

  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    // Create full timestamp for tooltip (locale-aware with timezone)
    const fullTimestamp = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(date)

    // Use relative time for recent syncs
    if (diffMinutes < 1) {
      return { display: 'just now', tooltip: fullTimestamp }
    } else if (diffMinutes < 60) {
      const label = diffMinutes === 1 ? 'minute' : 'minutes'
      return { display: `${diffMinutes} ${label} ago`, tooltip: fullTimestamp }
    } else if (diffHours < 24) {
      const label = diffHours === 1 ? 'hour' : 'hours'
      return { display: `${diffHours} ${label} ago`, tooltip: fullTimestamp }
    } else if (diffDays < 7) {
      const label = diffDays === 1 ? 'day' : 'days'
      return { display: `${diffDays} ${label} ago`, tooltip: fullTimestamp }
    }

    // Use absolute time for older syncs (7+ days)
    const formattedDate = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)

    const formattedTime = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)

    return {
      display: `${formattedDate} • ${formattedTime}`,
      tooltip: fullTimestamp,
    }
  } catch (error) {
    // Handle invalid date strings gracefully
    return { display: 'never', tooltip: null }
  }
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-teal-500/20"></div>
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-teal-500 animate-spin"></div>
      </div>
    </div>
  )
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [originalPrefs, setOriginalPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingCalendar, setSyncingCalendar] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [sendingTestReminder, setSendingTestReminder] = useState(false)

  // Confirmation dialogs state
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [resyncDialogMode, setResyncDialogMode] = useState<'delete' | 'keep' | null>(null)

  // Check if preferences have changed (dirty state)
  const hasChanges = prefs && originalPrefs
    ? JSON.stringify(prefs) !== JSON.stringify(originalPrefs)
    : false

  useEffect(() => {
    fetchPreferences()

    // Check for OAuth callback messages
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'google_connected') {
      toast.success('Google account connected successfully!')
    } else if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, ' ')}`)
    }
  }, [searchParams])

  async function fetchPreferences() {
    try {
      const res = await fetch('/api/preferences')
      if (res.ok) {
        const data = await res.json()

        // Ensure reminder_days always has exactly one value (default to 3 days)
        if (!data.reminder_days || data.reminder_days.length === 0) {
          data.reminder_days = [3]
        } else if (data.reminder_days.length > 1) {
          // If multiple values exist (legacy data), keep only the first one
          data.reminder_days = [data.reminder_days[0]]
        }

        setPrefs(data)
        setOriginalPrefs(data)
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err)
    } finally {
      setLoading(false)
    }
  }

  async function savePreferences() {
    if (!prefs) return
    setSaving(true)

    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })

      if (res.ok) {
        toast.success('Preferences saved!')
        setOriginalPrefs(prefs) // Update original to match current
      } else {
        const data = await res.json().catch(() => ({}))
        const sanitizedError = (data.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Failed to save preferences', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to save preferences', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  function discardChanges() {
    if (originalPrefs) {
      setPrefs(originalPrefs)
      toast.info('Changes discarded')
    }
  }

  async function disconnectGoogle() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/preferences', { method: 'DELETE' })
      const data = res.ok ? null : await res.json().catch(() => ({}))

      if (res.ok) {
        const newPrefs = { ...prefs!, google_connected: false, gmail_sync_enabled: false }
        setPrefs(newPrefs)
        setOriginalPrefs(newPrefs)
        toast.success('Google account disconnected')
        setShowDisconnectDialog(false)
      } else {
        const sanitizedError = (data?.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Failed to disconnect', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to disconnect', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setDisconnecting(false)
    }
  }

  async function syncGmail() {
    setSyncing(true)

    try {
      const res = await fetch('/api/sync-gmail', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Gmail synced successfully`, {
          description: `Scanned ${data.emailsScanned} emails, created ${data.billsCreated} bills`,
        })

        // Update "Last synced" UI immediately
        const now = new Date().toISOString()
        const updatedPrefs = { ...prefs!, last_gmail_sync: now }
        setPrefs(updatedPrefs)
        setOriginalPrefs(updatedPrefs)
      } else {
        const sanitizedError = (data.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Gmail sync failed', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to sync Gmail', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setSyncing(false)
    }
  }

  async function syncCalendar() {
    setSyncingCalendar(true)

    try {
      const res = await fetch('/api/sync-calendar', { method: 'PUT' })
      const data = await res.json()

      if (res.ok) {
        toast.success('Calendar synced successfully', {
          description: `Synced ${data.synced} of ${data.total} bills to Google Calendar`,
        })
      } else {
        const sanitizedError = (data.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Calendar sync failed', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to sync calendar', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setSyncingCalendar(false)
    }
  }

  async function resyncGmail(deleteAutoDetected: boolean) {
    setResyncing(true)

    try {
      // Step 1: Clear synced emails (and optionally delete bills)
      const clearRes = await fetch('/api/resync-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAutoDetectedBills: deleteAutoDetected }),
      })
      const clearData = await clearRes.json()

      if (!clearRes.ok) {
        const sanitizedError = (clearData.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Failed to prepare re-sync', {
          description: `${sanitizedError}. Please try again.`,
        })
        return
      }

      // Step 2: Trigger new sync
      const syncRes = await fetch('/api/sync-gmail', { method: 'POST' })
      const syncData = await syncRes.json()

      if (syncRes.ok) {
        toast.success('Re-sync complete!', {
          description: deleteAutoDetected
            ? `Deleted ${clearData.billsDeleted} old bills. Scanned ${syncData.emailsScanned} emails, created ${syncData.billsCreated} new bills.`
            : `Scanned ${syncData.emailsScanned} emails, created ${syncData.billsCreated} new bills.`,
        })

        // Update "Last synced" UI immediately
        const now = new Date().toISOString()
        const updatedPrefs = { ...prefs!, last_gmail_sync: now }
        setPrefs(updatedPrefs)
        setOriginalPrefs(updatedPrefs)
        setResyncDialogMode(null)
      } else {
        const sanitizedError = (syncData.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Re-sync failed', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to re-sync Gmail', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setResyncing(false)
    }
  }

  async function cleanupDuplicates() {
    setCleaningDuplicates(true)

    try {
      const res = await fetch('/api/cleanup-duplicates', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        if (data.duplicatesRemoved > 0) {
          toast.success('Duplicates removed!', {
            description: `Successfully removed ${data.duplicatesRemoved} duplicate bill${data.duplicatesRemoved > 1 ? 's' : ''}`,
          })
        } else {
          toast.info('No duplicates found', {
            description: 'Your bills are clean!',
          })
        }
      } else {
        const sanitizedError = (data.error || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Failed to cleanup duplicates', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to cleanup duplicates', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setCleaningDuplicates(false)
    }
  }

  async function sendTestReminder() {
    setSendingTestReminder(true)

    try {
      const res = await fetch('/api/send-reminders')
      const data = await res.json()

      if (res.ok && data.success) {
        toast.success('Test reminder sent!', {
          description: `Included ${data.billsIncluded} bills`,
        })
      } else {
        const sanitizedError = (data.error || data.message || 'Unknown error').replace(/[<>]/g, '')
        toast.error('Failed to send test reminder', {
          description: `${sanitizedError}. Please try again.`,
        })
      }
    } catch (err) {
      toast.error('Failed to send test reminder', {
        description: 'Network error. Please check your connection and try again.',
      })
    } finally {
      setSendingTestReminder(false)
    }
  }

  function setReminderDay(day: number) {
    if (!prefs) return
    // Single-select: always set to one value in array for backend compatibility
    setPrefs({ ...prefs, reminder_days: [day] })
  }

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
    <div className={`${spacing.sectionGap} pb-20 md:pb-0`}>
      {/* Header */}
      <PageHeader
        title="Settings"
        subtitle="Manage notifications, integrations, and account preferences"
      />

      {/* Dirty State Banner */}
      {hasChanges && (
        <div className="glass-card rounded-2xl p-4 border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className={`${typography.body} text-amber-400 font-medium`}>
                  You have unsaved changes
                </p>
                <p className={`${typography.bodySmall} text-amber-400/70`}>
                  Save your preferences or discard changes to continue
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={discardChanges}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white hover:bg-white/10"
              >
                Discard
              </Button>
              <Button
                onClick={savePreferences}
                disabled={saving}
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-semibold"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 max-w-4xl">
        {/* NOTIFICATIONS SECTION */}
        <section className="glass-card rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<Bell className="w-5 h-5" />}
            title="Notifications"
            subtitle="Email reminders for upcoming bills"
          />

          <div className="p-6 space-y-6">
            {/* Email Reminders Toggle */}
            <ToggleRow
              id="email-reminders"
              label="Email Reminders"
              description="Get notified before your bills are due"
              checked={prefs?.reminder_enabled ?? true}
              onCheckedChange={(checked) =>
                setPrefs((prev) => (prev ? { ...prev, reminder_enabled: checked } : null))
              }
            />

            {/* Reminder Settings - Dims when disabled */}
            <div
              className={`space-y-5 pt-5 border-t border-white/5 transition-opacity ${
                !prefs?.reminder_enabled ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              {/* Reminder Timing */}
              <div className="space-y-3">
                <Label className={`${typography.bodySmall} text-zinc-400 font-medium`}>Remind me</Label>
                <RadioGroup
                  value={prefs?.reminder_days[0]?.toString() || '3'}
                  onValueChange={(value) => setReminderDay(Number(value))}
                  disabled={!prefs?.reminder_enabled}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                >
                  {REMINDER_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`relative flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                        prefs?.reminder_days[0] === option.value
                          ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30 ring-1 ring-teal-500/20'
                          : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:border-white/20'
                      } ${!prefs?.reminder_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <RadioGroupItem
                        value={option.value.toString()}
                        className="sr-only"
                        disabled={!prefs?.reminder_enabled}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Email Address */}
              <div className="space-y-3">
                <Label htmlFor="email" className={`${typography.bodySmall} text-zinc-400 font-medium`}>
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={prefs?.email || ''}
                  onChange={(e) =>
                    setPrefs((prev) => (prev ? { ...prev, email: e.target.value } : null))
                  }
                  placeholder="your@email.com"
                  disabled={!prefs?.reminder_enabled}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 h-11 focus:border-teal-500/50 focus:ring-teal-500/20"
                />
              </div>

              {/* Test Button */}
              <Button
                onClick={sendTestReminder}
                disabled={!prefs?.reminder_enabled || sendingTestReminder}
                variant="outline"
                size="sm"
                className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5"
              >
                {sendingTestReminder ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Send Test Reminder
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS SECTION */}
        <section className="glass-card rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<Link2 className="w-5 h-5" />}
            title="Integrations"
            subtitle="Connect external services to automate bill tracking"
          />

          <div className="p-6 space-y-6">
            {/* Google Connection Status */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`${typography.body} text-white font-medium`}>Google Account</p>
                  {prefs?.google_connected ? (
                    <p className={`${typography.bodySmall} flex items-center gap-1.5 truncate`}>
                      <span className="text-zinc-500">Connected</span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-500">Last synced:</span>
                      <span
                        title={formatLastSync(prefs.last_gmail_sync).tooltip || undefined}
                        className="text-zinc-400 cursor-help hover:text-zinc-300 transition-colors"
                      >
                        {formatLastSync(prefs.last_gmail_sync).display}
                      </span>
                    </p>
                  ) : (
                    <p className={`${typography.bodySmall} text-zinc-500`}>
                      Connect to sync Gmail and Calendar
                    </p>
                  )}
                </div>
              </div>
              {prefs?.google_connected ? (
                <span className="px-3 py-1.5 bg-teal-500/15 text-teal-400 rounded-full text-xs font-semibold border border-teal-500/20 shrink-0">
                  Connected
                </span>
              ) : (
                <Button
                  asChild
                  size="sm"
                  className="bg-white text-zinc-900 hover:bg-zinc-100 font-medium shrink-0"
                >
                  <a href="/api/auth/google">Connect</a>
                </Button>
              )}
            </div>

            {/* Gmail Sync Toggle */}
            {prefs?.google_connected && (
              <>
                <ToggleRow
                  id="gmail-sync"
                  label="Auto-Detect Bills from Gmail"
                  description="Automatically scan Gmail for bill notifications and create bills"
                  checked={prefs?.gmail_sync_enabled ?? false}
                  onCheckedChange={(checked) =>
                    setPrefs((prev) =>
                      prev ? { ...prev, gmail_sync_enabled: checked } : null
                    )
                  }
                />

                {/* Integration Actions */}
                <div className="pt-5 border-t border-white/5 space-y-3">
                  <p className={`${typography.bodySmall} text-zinc-500`}>
                    Manually sync your data with Google services
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={syncGmail}
                      disabled={syncing || resyncing}
                      className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold"
                    >
                      {syncing ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          Syncing Gmail...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Sync Gmail Now
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={syncCalendar}
                      disabled={syncingCalendar || resyncing}
                      variant="outline"
                      className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5"
                    >
                      {syncingCalendar ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Syncing Calendar...
                        </>
                      ) : (
                        <>
                          <Calendar className="w-4 h-4 mr-2" />
                          Sync to Calendar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Disconnect */}
                <div className="pt-5 border-t border-white/5">
                  <Button
                    onClick={() => setShowDisconnectDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 -ml-2"
                  >
                    Disconnect Google Account
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* DATA MANAGEMENT SECTION (DANGER ZONE) */}
        {prefs?.google_connected && (
          <section className="glass-card rounded-2xl overflow-hidden border-rose-500/20">
            <SectionHeader
              icon={<Database className="w-5 h-5" />}
              title="Data Management"
              subtitle="Advanced tools for managing your synced data"
              variant="danger"
            />

            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className={`${typography.body} text-rose-400 font-medium mb-1`}>
                    Danger Zone
                  </p>
                  <p className={`${typography.bodySmall} text-rose-400/70`}>
                    These actions cannot be undone. Use with caution.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Cleanup Duplicates Section */}
                <div className="space-y-3">
                  <p className={`${typography.bodySmall} text-zinc-400`}>
                    Seeing duplicate bills on your calendar? Remove them with one click
                  </p>
                  <Button
                    onClick={cleanupDuplicates}
                    disabled={cleaningDuplicates || resyncing || syncing}
                    variant="outline"
                    className="border-teal-500/30 text-teal-400 hover:bg-teal-500/10 hover:border-teal-500/50"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {cleaningDuplicates ? 'Cleaning...' : 'Clean Up Duplicates'}
                  </Button>
                  <p className={`${typography.bodySmall} text-zinc-600`}>
                    Finds and removes duplicate bills with the same name, amount, and due date. Keeps the oldest version.
                  </p>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/5" />

                {/* Re-scan Section */}
                <div className="space-y-3">
                  <p className={`${typography.bodySmall} text-zinc-400`}>
                    Having issues with wrong dates or amounts? Re-scan your Gmail with improved AI
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => setResyncDialogMode('delete')}
                      disabled={resyncing || syncing || cleaningDuplicates}
                      variant="outline"
                      className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {resyncing ? 'Re-scanning...' : 'Delete & Re-scan All'}
                    </Button>
                    <Button
                      onClick={() => setResyncDialogMode('keep')}
                      disabled={resyncing || syncing || cleaningDuplicates}
                      variant="outline"
                      className="border-white/10 text-zinc-400 hover:text-zinc-300 hover:bg-white/5"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {resyncing ? 'Re-scanning...' : 'Re-scan (Keep Bills)'}
                    </Button>
                  </div>
                  <p className={`${typography.bodySmall} text-zinc-600`}>
                    "Delete & Re-scan" permanently removes all auto-detected bills and creates fresh
                    ones. "Re-scan" keeps existing bills and only adds new ones.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PLAN SECTION */}
        <section className="glass-card rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<Crown className="w-5 h-5" />}
            title="Plan & Billing"
            subtitle="Manage your subscription and billing"
          />

          <div className="p-6">
            {prefs?.subscription_tier === 'pro' ? (
              // Pro User
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/50">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className={`${typography.body} text-white font-semibold`}>Pro Plan</p>
                      <p className={`${typography.bodySmall} text-zinc-400`}>
                        Status: <span className="capitalize">{prefs.subscription_status || 'Active'}</span>
                      </p>
                      {prefs.subscription_current_period_end && (
                        <p className={`${typography.bodySmall} text-zinc-500`}>
                          Renews {new Date(prefs.subscription_current_period_end).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                    <Sparkles className="w-4 h-4" />
                    <span className={`${typography.bodySmall} font-medium`}>Active</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className={`${typography.body} text-white font-medium`}>Pro Features</h4>
                  <ul className={`${typography.bodySmall} text-zinc-400 space-y-1 ml-4`}>
                    <li>✓ Unlimited bills</li>
                    <li>✓ Unlimited Gmail sync</li>
                    <li>✓ AI-powered categorization</li>
                    <li>✓ Advanced reminders</li>
                    <li>✓ Spending analytics</li>
                  </ul>
                </div>

                <Button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/create-portal', { method: 'POST' })
                      const data = await res.json()
                      if (data.url) window.location.href = data.url
                      else toast.error('Failed to open billing portal')
                    } catch (error) {
                      toast.error('Failed to open billing portal')
                    }
                  }}
                  variant="outline"
                  className="w-full border-white/10 text-zinc-300 hover:text-white hover:bg-white/5"
                >
                  Manage Subscription
                </Button>
              </div>
            ) : (
              // Free User
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-zinc-500/20 to-zinc-600/20 border border-zinc-500/30 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-zinc-400" />
                </div>
                <p className={`${typography.body} text-white font-medium mb-2`}>Free Plan</p>
                <p className={`${typography.bodySmall} text-zinc-500 mb-1`}>
                  Up to 10 active bills
                </p>
                <p className={`${typography.bodySmall} text-zinc-600 mb-6`}>
                  Upgrade to Pro for unlimited bills and premium features
                </p>
                <Button
                  onClick={() => (window.location.href = '/pricing')}
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold shadow-lg shadow-teal-500/50"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Save Button - Only show when there are unsaved changes */}
      {hasChanges && (
        <div className="flex items-center justify-between pt-6 border-t border-white/5 max-w-4xl flex-wrap gap-4">
          <p className={`${typography.bodySmall} text-zinc-500`}>
            You have unsaved changes
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={discardChanges}
              variant="ghost"
              className="text-zinc-400 hover:text-white hover:bg-white/10"
            >
              Discard Changes
            </Button>
            <Button
              onClick={savePreferences}
              disabled={saving}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold px-8"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Preferences'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Disconnect Google Confirmation Dialog */}
      <ConfirmDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
        {...confirmDialogPresets.disconnectGoogle()}
        isLoading={disconnecting}
        onConfirm={disconnectGoogle}
      />

      {/* Resync Gmail Confirmation Dialog */}
      <ConfirmDialog
        open={resyncDialogMode !== null}
        onOpenChange={(open) => !open && setResyncDialogMode(null)}
        {...confirmDialogPresets.resyncGmail(resyncDialogMode === 'delete')}
        isLoading={resyncing}
        onConfirm={async () => {
          await resyncGmail(resyncDialogMode === 'delete')
        }}
      />
    </div>
  )
}

// Section Header Component
function SectionHeader({
  icon,
  title,
  subtitle,
  variant = 'default',
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  variant?: 'default' | 'danger'
}) {
  return (
    <div
      className={`px-6 py-4 border-b border-white/5 ${
        variant === 'danger' ? 'bg-rose-500/5' : 'bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            variant === 'danger'
              ? 'bg-rose-500/20 text-rose-400'
              : 'bg-gradient-to-br from-teal-500 to-cyan-500 text-white'
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`${typography.sectionTitle}`}>{title}</h2>
          <p className={`${typography.bodySmall} text-zinc-500`}>{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

// Toggle Row Component - Makes entire row clickable with full accessibility
function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all group"
    >
      <div className="flex-1 min-w-0">
        <label
          id={labelId}
          htmlFor={id}
          className={`${typography.body} text-white font-medium mb-0.5 block cursor-pointer`}
        >
          {label}
        </label>
        <p id={descriptionId} className={`${typography.bodySmall} text-zinc-500`}>
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="shrink-0"
      />
    </div>
  )
}
