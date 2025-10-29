import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Get all matchups for the active season
    const { data: matchups, error } = await supabase
      .from('matchups_with_vcs')
      .select('*')
      .order('match_number')

    if (error) {
      console.error('Error fetching tournament bracket:', error)
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    }

    if (!matchups || matchups.length === 0) {
      return NextResponse.json({ ok: true, matchups: [] })
    }

    // Transform the data to match the expected format
    const transformedMatchups = matchups.map(matchup => ({
      id: matchup.id,
      matchNumber: matchup.match_number,
      round: matchup.round,
      seasonId: matchup.season_id,
      startedAt: matchup.started_at,
      endsAt: matchup.ends_at,
      vcA: matchup.vc_a ? {
        id: matchup.vc_a.id,
        name: matchup.vc_a.name,
        colorHex: matchup.vc_a.color_hex,
        conference: matchup.vc_a.conference,
        currentCp: matchup.current_cp_a
      } : null,
      vcB: matchup.vc_b ? {
        id: matchup.vc_b.id,
        name: matchup.vc_b.name,
        colorHex: matchup.vc_b.color_hex,
        conference: matchup.vc_b.conference,
        currentCp: matchup.current_cp_b
      } : null,
      active: matchup.active,
      finished: matchup.finished,
      winner: matchup.winner_id ? (
        matchup.winner_id === matchup.vc_a?.id ? matchup.vc_a : matchup.vc_b
      ) : null,
      finalCpA: matchup.final_cp_a,
      finalCpB: matchup.final_cp_b
    }))

    return NextResponse.json({ 
      ok: true, 
      matchups: transformedMatchups 
    })

  } catch (error) {
    console.error('Error in tournament-bracket endpoint:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
