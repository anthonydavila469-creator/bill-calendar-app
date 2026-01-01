import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Button } from '@/components/ui/button'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-teal-500/10 blur-[120px] animate-pulse" />
        <div className="absolute top-[40%] right-[-15%] w-[500px] h-[500px] rounded-full bg-violet-500/10 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full bg-cyan-500/8 blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10">
        <div className="container mx-auto px-6 py-8">
          {/* Header */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">BillFlow</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/auth/login">
                <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-300">
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/signup">
                <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold px-6 transition-all duration-300 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40">
                  Get Started
                </Button>
              </Link>
            </div>
          </nav>

          {/* Hero Section */}
          <div className="max-w-5xl mx-auto text-center pt-12 pb-24">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <span className="text-sm text-zinc-400">AI-Powered Bill Management</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              Never Miss a{' '}
              <span className="gradient-text">Bill Payment</span>
              <br />
              Again
            </h1>

            <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Track all your recurring bills in one beautiful dashboard. Get smart reminders,
              visualize spending patterns, and let AI categorize your expenses automatically.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth/signup">
                <Button size="lg" className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold text-lg px-10 py-7 rounded-2xl transition-all duration-300 shadow-2xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-105">
                  Start Free Today
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="lg" variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 text-white text-lg px-10 py-7 rounded-2xl transition-all duration-300 backdrop-blur-sm">
                  Sign In
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="flex justify-center gap-12 mt-16 pt-16 border-t border-white/5">
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">100%</div>
                <div className="text-sm text-zinc-500 mt-1">Free to Use</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">Smart</div>
                <div className="text-sm text-zinc-500 mt-1">AI Categories</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text">Secure</div>
                <div className="text-sm text-zinc-500 mt-1">Bank-Level</div>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="max-w-6xl mx-auto mb-24">
            <div className="grid md:grid-cols-3 gap-6">
              <FeatureCard
                icon={<CalendarIcon />}
                title="Visual Calendar"
                description="See all your bills laid out on an intuitive calendar. Color-coded by category for instant clarity."
                gradient="from-blue-500 to-cyan-500"
              />
              <FeatureCard
                icon={<BellIcon />}
                title="Smart Reminders"
                description="Get notified before bills are due. Customize reminder timing to match your payment habits."
                gradient="from-violet-500 to-purple-500"
              />
              <FeatureCard
                icon={<ChartIcon />}
                title="Spending Insights"
                description="Track payments by category and time. Understand your recurring expenses at a glance."
                gradient="from-amber-500 to-orange-500"
              />
            </div>
          </div>

          {/* AI Feature Highlight */}
          <div className="max-w-4xl mx-auto mb-24">
            <div className="glass-card rounded-3xl p-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-violet-500/20 to-transparent rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-500/20 to-transparent rounded-full blur-3xl" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 mb-6">
                  <SparkleIcon className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-violet-300">AI-Powered</span>
                </div>

                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Automatic Bill Categorization
                </h2>

                <p className="text-lg text-zinc-400 mb-8 max-w-2xl">
                  Just type &ldquo;Netflix $15.99&rdquo; and our AI instantly recognizes it as Entertainment.
                  No manual sorting required. Powered by Claude AI.
                </p>

                <div className="flex flex-wrap gap-3">
                  {['Utilities', 'Subscriptions', 'Insurance', 'Housing', 'Entertainment'].map((cat) => (
                    <span key={cat} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-zinc-300">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="max-w-3xl mx-auto text-center pb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to take control of your bills?
            </h2>
            <p className="text-lg text-zinc-400 mb-8">
              Join thousands who never miss a payment. Start tracking in under 2 minutes.
            </p>
            <Link href="/auth/signup">
              <Button size="lg" className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold text-lg px-12 py-7 rounded-2xl transition-all duration-300 shadow-2xl shadow-teal-500/25 hover:shadow-teal-500/40">
                Create Free Account
              </Button>
            </Link>
          </div>

          {/* Footer */}
          <footer className="border-t border-white/5 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-zinc-500">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="font-medium">BillFlow</span>
              </div>
              <p className="text-sm text-zinc-600">
                Built with Next.js, Supabase & Claude AI
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description, gradient }: {
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
}) {
  return (
    <div className="glass-card glass-card-hover rounded-2xl p-8 group">
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3 text-white">{title}</h3>
      <p className="text-zinc-400 leading-relaxed">{description}</p>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
    </svg>
  )
}
