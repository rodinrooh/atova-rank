import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdminAccess } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    // Get all matchups
    const { data: matchups, error: matchupsError } = await supabaseAdmin
      .from('matchups')
      .select('match_number, round, vc_a_id, vc_b_id, active, finished, started_at, ends_at, current_cp_a, current_cp_b, winner_id')
      .order('match_number')

    if (matchupsError) {
      return NextResponse.json({ ok: false, error: matchupsError.message }, { status: 500 })
    }

    // Get VCs
    const { data: vcs, error: vcsError } = await supabaseAdmin
      .from('vcs')
      .select('id, name, conference, eliminated')

    if (vcsError) {
      return NextResponse.json({ ok: false, error: vcsError.message }, { status: 500 })
    }

    // Get seasons
    const { data: seasons, error: seasonsError } = await supabaseAdmin
      .from('seasons')
      .select('id, name, active, start_date')

    if (seasonsError) {
      return NextResponse.json({ ok: false, error: seasonsError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      matchups,
      vcs,
      seasons,
      currentTime: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in debug-db endpoint:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
