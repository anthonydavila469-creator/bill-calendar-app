import { Resend } from 'resend'

// Lazy initialization to avoid build-time errors when API key isn't set
let resend: Resend | null = null

function getResendClient(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY || '')
  }
  return resend
}

export interface BillReminderData {
  billName: string
  amount: number
  dueDate: string
  daysUntilDue: number
  category: string
}

// Send a bill reminder email
export async function sendBillReminder(
  to: string,
  bills: BillReminderData[]
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0)

  // Build HTML email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill Reminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #14b8a6; font-size: 28px; margin: 0;">Bill Reminder</h1>
          <p style="color: #71717a; font-size: 14px; margin-top: 8px;">
            You have ${bills.length} bill${bills.length > 1 ? 's' : ''} coming up
          </p>
        </div>

        <!-- Summary Card -->
        <div style="background: linear-gradient(135deg, rgba(20, 184, 166, 0.2) 0%, rgba(6, 182, 212, 0.1) 100%); border: 1px solid rgba(20, 184, 166, 0.3); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0;">Total Due</p>
          <p style="color: #14b8a6; font-size: 36px; font-weight: 700; margin: 8px 0 0 0;">$${totalAmount.toFixed(2)}</p>
        </div>

        <!-- Bills List -->
        <div style="background: rgba(18, 18, 26, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden;">
          ${bills.map((bill, index) => `
            <div style="padding: 20px; ${index < bills.length - 1 ? 'border-bottom: 1px solid rgba(255, 255, 255, 0.05);' : ''}">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="color: #f0f0f5; font-size: 16px; font-weight: 600; margin: 0;">${bill.billName}</p>
                    <p style="color: #71717a; font-size: 12px; margin: 4px 0 0 0;">
                      ${bill.category} &bull; Due ${bill.dueDate}
                    </p>
                  </td>
                  <td style="text-align: right;">
                    <p style="color: #14b8a6; font-size: 18px; font-weight: 600; margin: 0;">$${bill.amount.toFixed(2)}</p>
                    <p style="color: ${bill.daysUntilDue <= 1 ? '#ef4444' : bill.daysUntilDue <= 3 ? '#f59e0b' : '#71717a'}; font-size: 12px; margin: 4px 0 0 0;">
                      ${bill.daysUntilDue === 0 ? 'Due today!' : bill.daysUntilDue === 1 ? 'Due tomorrow' : `${bill.daysUntilDue} days left`}
                    </p>
                  </td>
                </tr>
              </table>
            </div>
          `).join('')}
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px;">
          <p style="color: #71717a; font-size: 12px; margin: 0;">
            Sent by Bill Calendar &bull; <a href="#" style="color: #14b8a6;">Manage preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  // Plain text version
  const text = `
Bill Reminder

You have ${bills.length} bill${bills.length > 1 ? 's' : ''} coming up totaling $${totalAmount.toFixed(2)}

${bills.map(bill => `- ${bill.billName}: $${bill.amount.toFixed(2)} (due ${bill.dueDate}, ${bill.daysUntilDue} days left)`).join('\n')}

---
Sent by Bill Calendar
  `.trim()

  try {
    const { error } = await getResendClient().emails.send({
      from: process.env.REMINDER_FROM_EMAIL || 'Bill Calendar <onboarding@resend.dev>',
      to,
      subject: `Bill Reminder: ${bills.length} bill${bills.length > 1 ? 's' : ''} due soon ($${totalAmount.toFixed(2)})`,
      html,
      text,
    })

    if (error) {
      console.error('Resend error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, error: String(error) }
  }
}
