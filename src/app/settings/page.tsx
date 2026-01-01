'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Preferences {
  reminder_enabled: boolean
  reminder_days: number[]
  gmail_sync_enabled: boolean
  google_connected: boolean
  google_calendar_id: string
  last_gmail_sync: string | null
  email: string | null
}

const REMINDER_OPTIONS = [
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
  { value: 14, label: '14 days before' },
]

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
      <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
    </div>
  )
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchPreferences()

    // Check for OAuth callback messages
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'google_connected') {
      setMessage({ type: 'success', text: 'Google account connected successfully!' })
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error.replace(/_/g, ' ')}` })
    }
  }, [searchParams])

  async function fetchPreferences() {
    try {
      const res = await fetch('/api/preferences')
      if (res.ok) {
        const data = await res.json()
        setPrefs(data)
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
    setMessage(null)

    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Preferences saved!' })
      } else {
        setMessage({ type: 'error', text: 'Failed to save preferences' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save preferences' })
    } finally {
      setSaving(false)
    }
  }

  async function disconnectGoogle() {
    if (!confirm('Are you sure you want to disconnect your Google account?')) return

    try {
      const res = await fetch('/api/preferences', { method: 'DELETE' })
      if (res.ok) {
        setPrefs(prev => prev ? { ...prev, google_connected: false, gmail_sync_enabled: false } : null)
        setMessage({ type: 'success', text: 'Google account disconnected' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect' })
    }
  }

  async function syncGmail() {
    setSyncing(true)
    setMessage(null)

    try {
      const res = await fetch('/api/sync-gmail', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Scanned ${data.emailsScanned} emails, created ${data.billsCreated} bills`,
        })
        fetchPreferences() // Refresh last sync time
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to sync Gmail' })
    } finally {
      setSyncing(false)
    }
  }

  async function syncCalendar() {
    setSyncing(true)
    setMessage(null)

    try {
      const res = await fetch('/api/sync-calendar', { method: 'PUT' })
      const data = await res.json()

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Synced ${data.synced} of ${data.total} bills to Google Calendar`,
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to sync calendar' })
    } finally {
      setSyncing(false)
    }
  }

  async function resyncGmail(deleteAutoDetected: boolean) {
    const confirmMessage = deleteAutoDetected
      ? 'This will DELETE all auto-detected bills and re-scan your Gmail with improved AI. Continue?'
      : 'This will clear sync history and re-scan your Gmail. Existing bills will remain. Continue?'

    if (!confirm(confirmMessage)) return

    setResyncing(true)
    setMessage(null)

    try {
      // Step 1: Clear synced emails (and optionally delete bills)
      const clearRes = await fetch('/api/resync-gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAutoDetectedBills: deleteAutoDetected }),
      })
      const clearData = await clearRes.json()

      if (!clearRes.ok) {
        setMessage({ type: 'error', text: clearData.error || 'Failed to prepare re-sync' })
        return
      }

      // Step 2: Trigger new sync
      const syncRes = await fetch('/api/sync-gmail', { method: 'POST' })
      const syncData = await syncRes.json()

      if (syncRes.ok) {
        setMessage({
          type: 'success',
          text: `Re-sync complete! ${deleteAutoDetected ? `Deleted ${clearData.billsDeleted} old bills. ` : ''}Scanned ${syncData.emailsScanned} emails, created ${syncData.billsCreated} new bills.`,
        })
        fetchPreferences()
      } else {
        setMessage({ type: 'error', text: syncData.error || 'Re-sync failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to re-sync Gmail' })
    } finally {
      setResyncing(false)
    }
  }

  async function sendTestReminder() {
    setMessage(null)

    try {
      const res = await fetch('/api/send-reminders')
      const data = await res.json()

      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `Test reminder sent with ${data.billsIncluded} bills` })
      } else {
        setMessage({ type: 'error', text: data.error || data.message || 'Failed to send' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send test reminder' })
    }
  }

  function toggleReminderDay(day: number) {
    if (!prefs) return
    const days = prefs.reminder_days.includes(day)
      ? prefs.reminder_days.filter(d => d !== day)
      : [...prefs.reminder_days, day].sort((a, b) => a - b)
    setPrefs({ ...prefs, reminder_days: days })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-teal-400 transition-colors mb-4 group"
        >
          <svg
            className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
        <p className="text-zinc-400">Manage your sync and notification preferences</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl ${
            message.type === 'success'
              ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Google Connection */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Google Account</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Connect to sync Gmail bills and Google Calendar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {prefs?.google_connected ? (
              <span className="px-3 py-1 bg-teal-500/20 text-teal-400 rounded-full text-sm font-medium">
                Connected
              </span>
            ) : (
              <span className="px-3 py-1 bg-zinc-700/50 text-zinc-400 rounded-full text-sm font-medium">
                Not Connected
              </span>
            )}
          </div>
        </div>

        {prefs?.google_connected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={syncGmail}
                disabled={syncing || resyncing}
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white"
              >
                {syncing ? 'Syncing...' : 'Sync Gmail Now'}
              </Button>
              <Button
                onClick={syncCalendar}
                disabled={syncing || resyncing}
                variant="outline"
                className="border-white/10 text-white hover:bg-white/5"
              >
                Sync to Calendar
              </Button>
              <Button
                onClick={disconnectGoogle}
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Disconnect
              </Button>
            </div>

            {/* Re-sync Section */}
            <div className="pt-4 border-t border-white/10">
              <p className="text-sm text-zinc-400 mb-3">
                Having issues with wrong dates or amounts? Re-scan with improved AI:
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => resyncGmail(true)}
                  disabled={resyncing || syncing}
                  variant="outline"
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  {resyncing ? 'Re-syncing...' : 'Delete & Re-scan All'}
                </Button>
                <Button
                  onClick={() => resyncGmail(false)}
                  disabled={resyncing || syncing}
                  variant="outline"
                  className="border-white/10 text-zinc-300 hover:bg-white/5"
                >
                  Re-scan (Keep Bills)
                </Button>
              </div>
              <p className="text-xs text-zinc-600 mt-2">
                "Delete & Re-scan" removes all auto-detected bills and creates fresh ones
              </p>
            </div>

            {prefs.last_gmail_sync && (
              <p className="text-xs text-zinc-500">
                Last synced: {new Date(prefs.last_gmail_sync).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <Button
            asChild
            className="bg-white text-black hover:bg-zinc-200"
          >
            <a href="/api/auth/google">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Connect Google Account
            </a>
          </Button>
        )}
      </div>

      {/* Email Reminders */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Email Reminders</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Get email notifications before bills are due
            </p>
          </div>
          <Switch
            checked={prefs?.reminder_enabled ?? true}
            onCheckedChange={(checked) =>
              setPrefs(prev => prev ? { ...prev, reminder_enabled: checked } : null)
            }
          />
        </div>

        {prefs?.reminder_enabled && (
          <>
            <div className="space-y-3">
              <Label className="text-zinc-300">Remind me</Label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleReminderDay(option.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      prefs?.reminder_days.includes(option.value)
                        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                        : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="email" className="text-zinc-300">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                value={prefs?.email || ''}
                onChange={(e) =>
                  setPrefs(prev => prev ? { ...prev, email: e.target.value } : null)
                }
                placeholder="your@email.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
              />
            </div>

            <Button
              onClick={sendTestReminder}
              variant="outline"
              className="border-white/10 text-white hover:bg-white/5"
            >
              Send Test Reminder
            </Button>
          </>
        )}
      </div>

      {/* Gmail Auto-Sync */}
      {prefs?.google_connected && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Auto-Detect Bills</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Automatically scan Gmail for bill notifications and add them
              </p>
            </div>
            <Switch
              checked={prefs?.gmail_sync_enabled ?? false}
              onCheckedChange={(checked) =>
                setPrefs(prev => prev ? { ...prev, gmail_sync_enabled: checked } : null)
              }
            />
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={savePreferences}
          disabled={saving}
          className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white px-8"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  )
}
