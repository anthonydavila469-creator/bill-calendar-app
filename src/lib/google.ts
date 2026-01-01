import { google } from 'googleapis'

// Google OAuth2 scopes needed for Gmail and Calendar
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

// Get the redirect URI - must be consistent everywhere
export function getRedirectUri() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/api/auth/google/callback`
}

// Create OAuth2 client
export function getOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || getRedirectUri()
  )
}

// Generate authorization URL
export function getAuthUrl() {
  const redirectUri = getRedirectUri()
  console.log('Generating auth URL with redirect URI:', redirectUri)

  const oauth2Client = getOAuth2Client(redirectUri)

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent', // Force consent to get refresh token
    redirect_uri: redirectUri, // Explicitly set redirect_uri
  })
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

// Create authenticated OAuth2 client with tokens
export function getAuthenticatedClient(accessToken: string, refreshToken: string | null) {
  const oauth2Client = getOAuth2Client()

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  return oauth2Client
}

// Refresh access token if expired
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuth2Client()

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

// Get user email from Google
export async function getGoogleUserEmail(accessToken: string) {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()

  return data.email
}
