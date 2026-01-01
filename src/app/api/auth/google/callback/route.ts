import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getGoogleUserEmail } from '@/lib/google'
import { google } from 'googleapis'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  console.log('OAuth callback received')
  console.log('Redirect URI:', redirectUri)
  console.log('Code received:', code ? 'yes' : 'no')

  if (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}/settings?error=google_auth_failed`)
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?error=no_code`)
  }

  try {
    // Create OAuth client with exact same redirect URI
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    )

    console.log('Exchanging code for tokens...')
    console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...')
    console.log('Client Secret exists:', !!process.env.GOOGLE_CLIENT_SECRET)
    console.log('Client Secret length:', process.env.GOOGLE_CLIENT_SECRET?.length || 0)

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    console.log('Tokens received:', tokens.access_token ? 'yes' : 'no')

    if (!tokens.access_token) {
      throw new Error('No access token received')
    }

    // Get user email from Google
    const googleEmail = await getGoogleUserEmail(tokens.access_token)

    // Get current user from Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/auth/login?error=not_authenticated`)
    }

    // Save or update tokens in user_preferences
    const { error: upsertError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        gmail_sync_enabled: true,
        email: googleEmail || user.email,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

    if (upsertError) {
      console.error('Error saving tokens:', upsertError)
      return NextResponse.redirect(`${baseUrl}/settings?error=save_failed`)
    }

    return NextResponse.redirect(`${baseUrl}/settings?success=google_connected`)
  } catch (err: unknown) {
    console.error('Error in Google OAuth callback:', err)

    // Log more details about the error
    if (err && typeof err === 'object') {
      const errorObj = err as Record<string, unknown>
      if (errorObj.response) {
        const response = errorObj.response as Record<string, unknown>
        console.error('Error response data:', response.data)
        console.error('Error response status:', response.status)
      }
      if (errorObj.message) {
        console.error('Error message:', errorObj.message)
      }
    }

    return NextResponse.redirect(`${baseUrl}/settings?error=auth_error`)
  }
}
