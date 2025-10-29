import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdminAccess } from '@/lib/auth'
import { CP_START, MATCH_DURATION_HOURS } from '@/lib/constants'

interface StartSeasonRequest {
  seasonId: string
}

function validateStartSeasonRequest(body: any): body is StartSeasonRequest {
  return body && typeof body === 'object' && typeof body.seasonId === 'string'
}

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    if (!validateStartSeasonRequest(body)) {
      return NextResponse.json({ ok: false, code: 'InvalidInput' }, { status: 400 })
    }

    const { seasonId } = body

    // Use RPC for atomic operation
    const { error: rpcError } = await supabaseAdmin.rpc('start_season', {
      p_season_id: seasonId,
      p_match_duration_hours: MATCH_DURATION_HOURS,
      p_cp_start: CP_START
    })

    if (rpcError) {
      console.error('Start season RPC error:', rpcError)
      
      // Handle specific error cases
      if (rpcError.message.includes('season_not_found')) {
        return NextResponse.json({ ok: false, code: 'SeasonNotFound' }, { status: 404 })
      }
      if (rpcError.message.includes('matchup_not_found')) {
        return NextResponse.json({ ok: false, code: 'MatchupNotFound' }, { status: 404 })
      }
      if (rpcError.message.includes('matchup_not_ready')) {
        return NextResponse.json({ ok: false, code: 'MatchupNotReady' }, { status: 400 })
      }
      
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Start season error:', error)
    return NextResponse.json({ ok: false, code: 'InternalError' }, { status: 500 })
  }
}
