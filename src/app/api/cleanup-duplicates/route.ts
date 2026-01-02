import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active bills for this user
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }) // Keep oldest ones

    if (!bills || bills.length === 0) {
      return NextResponse.json({
        success: true,
        duplicatesRemoved: 0,
        message: 'No bills found',
      })
    }

    // Group bills by KEYWORD-based matching + amount + due_day to find duplicates
    // This catches variations like "Chase Credit Card" vs "Chase Ink Business Cash Visa"
    const billGroups = new Map<string, typeof bills>()

    for (const bill of bills) {
      // Normalize for better duplicate detection
      const normalizedName = bill.name.trim().toLowerCase()
      const normalizedAmount = Number(bill.amount).toFixed(2) // Handle 127 vs 127.00

      // Extract main company keyword (remove common card descriptors)
      const keywords = normalizedName.split(/\s+/)
        .filter(word => !['card', 'credit', 'visa', 'mastercard', 'amex', 'business', 'cash', 'ink', 'freedom', 'sapphire', 'platinum', 'rewards'].includes(word))
      const mainKeyword = keywords[0] || normalizedName // e.g., "chase" from "chase ink business cash visa"

      // Group by: main keyword + amount + due_day
      // This catches "chase credit card" and "chase ink business" as same bill
      const key = `${mainKeyword}|${normalizedAmount}|${bill.due_day}`

      const group = billGroups.get(key) || []
      group.push(bill)
      billGroups.set(key, group)
    }

    // Find and remove duplicates (keep first/oldest, remove rest)
    let duplicatesRemoved = 0
    const duplicateIds: string[] = []

    for (const [key, group] of billGroups.entries()) {
      if (group.length > 1) {
        // Keep the first one (oldest), mark others for deletion
        const [keep, ...duplicates] = group
        console.log(`Found ${duplicates.length} duplicates for: ${keep.name}`)

        for (const duplicate of duplicates) {
          duplicateIds.push(duplicate.id)
          duplicatesRemoved++
        }
      }
    }

    // Deactivate duplicate bills (soft delete for consistency with rest of app)
    if (duplicateIds.length > 0) {
      const { error: updateError } = await supabase
        .from('bills')
        .update({ is_active: false })
        .in('id', duplicateIds)

      if (updateError) {
        console.error('Error deactivating duplicates:', updateError)
        return NextResponse.json(
          { error: `Failed to deactivate duplicates: ${updateError.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      duplicatesRemoved,
      message: duplicatesRemoved > 0
        ? `Successfully removed ${duplicatesRemoved} duplicate bill${duplicatesRemoved > 1 ? 's' : ''}`
        : 'No duplicates found',
    })
  } catch (error) {
    console.error('Cleanup duplicates error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup duplicates' },
      { status: 500 }
    )
  }
}
