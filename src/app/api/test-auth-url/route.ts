import { NextResponse } from 'next/server'
import { getAuthUrl, getRedirectUri } from '@/lib/google'

// Debug endpoint to see the actual auth URL being generated
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = getRedirectUri()

  let authUrl = ''
  try {
    authUrl = getAuthUrl()
  } catch (e) {
    authUrl = 'ERROR: ' + String(e)
  }

  return NextResponse.json({
    clientId: clientId || 'NOT SET',
    clientIdLength: clientId?.length || 0,
    hasClientSecret: !!clientSecret,
    clientSecretLength: clientSecret?.length || 0,
    redirectUri,
    authUrl,
  })
}
