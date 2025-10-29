import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type VCJson = {
  id: string | null
  name: string | null
  color_hex: string | null
  conference: 'left' | 'right' | null
}

type MatchupsWithVCsRow = {
  id: string
  season_id: string
  match_number: number
  round: number
  started_at: string | null
  ends_at: string | null
  current_cp_a: number
  current_cp_b: number
  final_cp_a: number | null
  final_cp_b: number | null
  winner_id: string | null
  active: boolean
  finished: boolean
  next_match_id: string | null
  vc_a: VCJson | null // always JSON object from view
  vc_b: VCJson | null // always JSON object from view
}

interface CurrentMatchupResponse {
  ok: boolean
  matchup: {
    id: string
    matchNumber: number
    round: number
    seasonId: string
    startedAt: string
    endsAt: string
    vcA: {
      id: string
      name: string
      colorHex: string
      conference: string
      currentCp: number
    }
    vcB: {
      id: string
      name: string
      colorHex: string
      conference: string
      currentCp: number
    }
  } | null
}

export async function GET() {
  try {
    console.log('📊 [API] GET /api/current-matchup - Fetching active matchup...')
    
    // Find the single active matchup using the view
    const { data: row, error } = await supabase
      .from('matchups_with_vcs')
      .select('*')
      .eq('active', true)
      .eq('finished', false)
      .single<MatchupsWithVCsRow>()

    if (error) {
      // If no active matchup found, return null (not an error)
      if (error.code === 'PGRST116') {
        console.log('📊 [API] No active matchup found')
        const response: CurrentMatchupResponse = {
          ok: true,
          matchup: null
        }
        return NextResponse.json(response)
      }
      
      console.error('📊 [API] Error fetching current matchup:', error)
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    }

    if (!row) {
      console.log('📊 [API] No active matchup found (row is null)')
      const response: CurrentMatchupResponse = {
        ok: true,
        matchup: null
      }
      return NextResponse.json(response)
    }

    // Validate required data
    if (!row.vc_a || !row.vc_b) {
      console.error('📊 [API] Missing VC data in active matchup:', row)
      return NextResponse.json({ ok: false, error: 'Active matchup missing VC data' }, { status: 500 })
    }

    console.log('📊 [API] Found active matchup:', {
      id: row.id,
      matchNumber: row.match_number,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      currentTime: new Date().toISOString(),
      isOverdue: new Date(row.ends_at!) < new Date()
    })

    const response: CurrentMatchupResponse = {
      ok: true,
      matchup: {
        id: row.id,
        matchNumber: row.match_number,
        round: row.round,
        seasonId: row.season_id,
        startedAt: row.started_at!,
        endsAt: row.ends_at!,
        vcA: {
          id: row.vc_a.id!,
          name: row.vc_a.name!,
          colorHex: row.vc_a.color_hex!,
          conference: row.vc_a.conference!,
          currentCp: row.current_cp_a
        },
        vcB: {
          id: row.vc_b.id!,
          name: row.vc_b.name!,
          colorHex: row.vc_b.color_hex!,
          conference: row.vc_b.conference!,
          currentCp: row.current_cp_b
        }
      }
    }

    console.log('📊 [API] Returning matchup data')
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error in current-matchup endpoint:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
