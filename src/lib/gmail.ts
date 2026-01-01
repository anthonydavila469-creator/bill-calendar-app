import { google } from 'googleapis'
import { getAuthenticatedClient, refreshAccessToken } from './google'

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
  body: string
}

// Get Gmail client
function getGmailClient(accessToken: string, refreshToken: string | null) {
  const auth = getAuthenticatedClient(accessToken, refreshToken)
  return google.gmail({ version: 'v1', auth })
}

// Recursively extract text from nested MIME parts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromParts(parts: any[]): { plain: string; html: string } {
  let plain = ''
  let html = ''

  for (const part of parts) {
    // Check nested parts first (multipart/alternative, multipart/mixed, multipart/related)
    if (part.parts && Array.isArray(part.parts)) {
      const nested = extractTextFromParts(part.parts)
      if (nested.plain && !plain) plain = nested.plain
      if (nested.html && !html) html = nested.html
    }

    // Extract content from this part
    if (part.body?.data) {
      const content = Buffer.from(part.body.data, 'base64').toString('utf-8')
      if (part.mimeType === 'text/plain' && !plain) {
        plain = content
      } else if (part.mimeType === 'text/html' && !html) {
        html = content
      }
    }
  }

  return { plain, html }
}

// Convert HTML to readable text, preserving important structure
function htmlToText(html: string): string {
  return html
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    // Decode numeric entities (like &#36; for $)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    // Preserve table structure - add separators for cells
    .replace(/<\/th>/gi, ' | ')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    // Add newlines for block elements
    .replace(/<\/(div|p|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    // Remove script and style content entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Search for bill-related emails
export async function searchBillEmails(
  accessToken: string,
  refreshToken: string | null,
  afterDate?: Date
): Promise<GmailMessage[]> {
  const gmail = getGmailClient(accessToken, refreshToken)

  // Build search query for bill-related emails
  const searchTerms = [
    'bill',
    'invoice',
    'payment due',
    'statement',
    'amount due',
    'pay by',
    'due date',
    'monthly payment',
    'subscription',
    'utility bill',
    'auto-pay',
  ]

  // Search in last 7 days by default
  const after = afterDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const afterStr = Math.floor(after.getTime() / 1000)

  const query = `(${searchTerms.map(t => `"${t}"`).join(' OR ')}) after:${afterStr}`

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    })

    const messages = response.data.messages || []
    const fullMessages: GmailMessage[] = []

    for (const msg of messages) {
      if (msg.id) {
        const fullMsg = await getEmailDetails(gmail, msg.id)
        if (fullMsg) {
          fullMessages.push(fullMsg)
        }
      }
    }

    return fullMessages
  } catch (error) {
    console.error('Error searching Gmail:', error)
    throw error
  }
}

// Get full email details
async function getEmailDetails(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<GmailMessage | null> {
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const message = response.data
    const headers = message.payload?.headers || []

    const getHeader = (name: string) =>
      headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

    // Extract body text using recursive extraction for nested MIME parts
    let body = ''

    if (message.payload?.body?.data) {
      // Simple message with body at top level
      const content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
      if (message.payload.mimeType === 'text/html') {
        body = htmlToText(content)
      } else {
        body = content
      }
    } else if (message.payload?.parts) {
      // Multipart message - recursively extract from nested parts
      const { plain, html } = extractTextFromParts(message.payload.parts)

      // Prefer plain text if it has substantial content
      if (plain && plain.length > 100) {
        body = plain
      } else if (html) {
        // Convert HTML to text, preserving table structure
        body = htmlToText(html)
      } else if (plain) {
        // Use plain even if short
        body = plain
      }
    }

    // Include snippet as additional context (Gmail's snippet often has key info)
    const snippet = message.snippet || ''
    const fullBody = body ? `${body}\n\n--- Email Preview ---\n${snippet}` : snippet

    return {
      id: message.id || '',
      threadId: message.threadId || '',
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      snippet: snippet,
      body: fullBody.slice(0, 8000), // Increased limit for better extraction
    }
  } catch (error) {
    console.error('Error getting email details:', error)
    return null
  }
}

// Check if tokens need refresh and refresh if needed
export async function ensureValidToken(
  accessToken: string,
  refreshToken: string | null,
  tokenExpiry: Date | null
): Promise<{ accessToken: string; refreshToken: string | null; expiry: Date | null }> {
  // If no expiry or expired, try to refresh
  if (!tokenExpiry || new Date() >= tokenExpiry) {
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const newCredentials = await refreshAccessToken(refreshToken)

    return {
      accessToken: newCredentials.access_token || accessToken,
      refreshToken: newCredentials.refresh_token || refreshToken,
      expiry: newCredentials.expiry_date ? new Date(newCredentials.expiry_date) : null,
    }
  }

  return { accessToken, refreshToken, expiry: tokenExpiry }
}
