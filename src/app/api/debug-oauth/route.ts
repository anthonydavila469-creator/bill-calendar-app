import { NextResponse } from 'next/server'

// Temporary debug endpoint - DELETE THIS AFTER DEBUGGING
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  return NextResponse.json({
    hasClientId: !!clientId,
    clientIdValue: clientId || 'NOT SET',
    clientIdLength: clientId?.length || 0,
    hasClientSecret: !!clientSecret,
    clientSecretValue: clientSecret || 'NOT SET',
    clientSecretLength: clientSecret?.length || 0,
    expectedClientIdStart: '518443593531',
    actualClientIdStart: clientId?.substring(0, 12) || 'N/A',
    expectedSecretStart: 'GOCSPX-',
    actualSecretStart: clientSecret?.substring(0, 7) || 'N/A',
  })
}
