import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    // Check admin access
    const adminCheck = await checkAdminAccess()
    if (!adminCheck.allowed) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 })
    }

    console.log('🔧 MANUAL RESOLVE - Finding active match to resolve...')

    // Find the current active match
    const { data: activeMatch, error: findError } = await supabaseAdmin
      .from('matchups')
      .select('id, match_number, vc_a_id, vc_b_id, current_cp_a, current_cp_b')
      .eq('active', true)
      .eq('finished', false)
      .single()

    if (findError || !activeMatch) {
      console.log('🔧 No active match found')
      return NextResponse.json({ ok: false, error: 'No active match found' }, { status: 404 })
    }

    console.log('🔧 Found active match:', activeMatch)

    // Determine winner (a16z has higher CP, so they win)
    const winnerId = activeMatch.current_cp_a > activeMatch.current_cp_b 
      ? activeMatch.vc_a_id 
      : activeMatch.vc_b_id

    console.log('🔧 Winner determined:', winnerId)

    // Resolve the match
    const { error: resolveError } = await supabaseAdmin
      .from('matchups')
      .update({
        active: false,
        finished: true,
        winner_id: winnerId,
        final_cp_a: activeMatch.current_cp_a,
        final_cp_b: activeMatch.current_cp_b,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeMatch.id)

    if (resolveError) {
      console.error('🔧 Error resolving match:', resolveError)
      return NextResponse.json({ ok: false, error: 'Failed to resolve match' }, { status: 500 })
    }

    console.log('🔧 Match resolved successfully')

    return NextResponse.json({ 
      ok: true, 
      message: 'Match resolved successfully',
      winnerId,
      finalScores: {
        vcA: activeMatch.current_cp_a,
        vcB: activeMatch.current_cp_b
      }
    })

  } catch (error) {
    console.error('🔧 Error in manual resolve:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
