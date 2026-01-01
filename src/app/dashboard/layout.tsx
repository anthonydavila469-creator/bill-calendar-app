import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Navigation from '@/components/Navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen">
      <Navigation userEmail={user.email || 'User'} />
      <div className="md:pl-72">
        <main className="py-8 px-6 lg:px-8 pb-28 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
