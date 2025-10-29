import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    // Get current active matchup
    const { data: activeMatchup, error } = await supabaseAdmin
      .from('matchups')
      .select('id, ends_at')
      .eq('active', true)
      .eq('finished', false)
      .single()

    if (error || !activeMatchup) {
      return NextResponse.json({ ok: false, error: 'No active matchup found' }, { status: 404 })
    }

    // Set ends_at to 1 minute from now to trigger scheduler
    const oneMinuteFromNow = new Date(Date.now() + 60 * 1000).toISOString()
    
    const { error: updateError } = await supabaseAdmin
      .from('matchups')
      .update({ ends_at: oneMinuteFromNow })
      .eq('id', activeMatchup.id)

    if (updateError) {
      console.error('Error updating matchup end time:', updateError)
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Matchup will end in 1 minute. Check back to see if next matchup started.' 
    })

  } catch (error) {
    console.error('Error in test-scheduler endpoint:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
