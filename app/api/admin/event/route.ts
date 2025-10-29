import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdminAccess } from '@/lib/auth'
import { EVENT_CUTOFF_SECONDS } from '@/lib/constants'

interface AdminEventRequest {
  seasonId: string
  matchupId: string
  vcId: string
  delta: number
  reason: string
}

function validateAdminEventRequest(body: any): body is AdminEventRequest {
  return body && 
    typeof body === 'object' &&
    typeof body.seasonId === 'string' &&
    typeof body.matchupId === 'string' &&
    typeof body.vcId === 'string' &&
    typeof body.delta === 'number' &&
    Number.isInteger(body.delta) &&
    typeof body.reason === 'string' &&
    body.reason.trim().length > 0
}

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    if (!validateAdminEventRequest(body)) {
      return NextResponse.json({ ok: false, code: 'InvalidInput' }, { status: 400 })
    }

    const { seasonId, matchupId, vcId, delta, reason } = body

    // Use RPC for atomic operation
    const { data, error: rpcError } = await supabaseAdmin.rpc('add_admin_event', {
      p_season_id: seasonId,
      p_matchup_id: matchupId,
      p_vc_id: vcId,
      p_delta: delta,
      p_reason: reason.trim(),
      p_cutoff_seconds: EVENT_CUTOFF_SECONDS
    })

    if (rpcError) {
      console.error('Admin event RPC error:', rpcError)
      
      // Handle specific error cases
      if (rpcError.message.includes('matchup_not_found')) {
        return NextResponse.json({ ok: false, code: 'MatchupNotFound' }, { status: 404 })
      }
      if (rpcError.message.includes('matchup_not_active')) {
        return NextResponse.json({ ok: false, code: 'MatchupNotActive' }, { status: 400 })
      }
      if (rpcError.message.includes('invalid_vc')) {
        return NextResponse.json({ ok: false, code: 'InvalidVC' }, { status: 400 })
      }
      if (rpcError.message.includes('window_closed')) {
        return NextResponse.json({ ok: false, code: 'WindowClosed' }, { status: 409 })
      }
      
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, newCp: data })
  } catch (error) {
    console.error('Admin event error:', error)
    return NextResponse.json({ ok: false, code: 'InternalError' }, { status: 500 })
  }
}
