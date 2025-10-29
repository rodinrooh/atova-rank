import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdminAccess } from '@/lib/auth'
import { CP_START } from '@/lib/constants'

interface VC {
  name: string
  color: string
  conference: 'left' | 'right'
}

interface SeedRequest {
  seasonId: string
  vcs: VC[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateSeedRequest(body: any): body is SeedRequest {
  if (!body || typeof body !== 'object') return false
  if (!body.seasonId || typeof body.seasonId !== 'string') return false
  if (!Array.isArray(body.vcs) || body.vcs.length !== 8) return false
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return body.vcs.every((vc: any) => 
    vc && 
    typeof vc === 'object' &&
    typeof vc.name === 'string' &&
    typeof vc.color === 'string' &&
    ['left', 'right'].includes(vc.conference)
  )
}

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    if (!validateSeedRequest(body)) {
      return NextResponse.json({ ok: false, code: 'InvalidInput' }, { status: 400 })
    }

    const { seasonId, vcs } = body

    // Verify season exists
    const { data: season, error: seasonCheckError } = await supabaseAdmin
      .from('seasons')
      .select('id')
      .eq('id', seasonId)
      .single()

    if (seasonCheckError || !season) {
      return NextResponse.json({ ok: false, code: 'SeasonNotFound' }, { status: 404 })
    }

    // Create VCs
    const { data: createdVcs, error: vcsError } = await supabaseAdmin
      .from('vcs')
      .insert(vcs.map(vc => ({
        season_id: seasonId,
        name: vc.name,
        color_hex: vc.color,
        conference: vc.conference,
        eliminated: false
      })))
      .select('id, conference')

    if (vcsError || !createdVcs) {
      console.error('Error creating VCs:', vcsError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // Create matchups
    const leftVcs = createdVcs.filter(vc => vc.conference === 'left')
    const rightVcs = createdVcs.filter(vc => vc.conference === 'right')

    // Create QF1-QF4 matchups
    const matchups = [
      { match_number: 1, round: 1, vc_a_id: leftVcs[0].id, vc_b_id: leftVcs[1].id, next_match_id: null },
      { match_number: 2, round: 1, vc_a_id: leftVcs[2].id, vc_b_id: leftVcs[3].id, next_match_id: null },
      { match_number: 3, round: 1, vc_a_id: rightVcs[0].id, vc_b_id: rightVcs[1].id, next_match_id: null },
      { match_number: 4, round: 1, vc_a_id: rightVcs[2].id, vc_b_id: rightVcs[3].id, next_match_id: null },
    ]

    const { data: createdMatchups, error: matchupsError } = await supabaseAdmin
      .from('matchups')
      .insert(matchups.map(m => ({
        season_id: seasonId,
        match_number: m.match_number,
        round: m.round,
        vc_a_id: m.vc_a_id,
        vc_b_id: m.vc_b_id,
        current_cp_a: CP_START,
        current_cp_b: CP_START,
        active: false,
        finished: false
      })))
      .select('id, match_number')

    if (matchupsError || !createdMatchups) {
      console.error('Error creating matchups:', matchupsError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // Create SF and Final matchups
    const _sfLeftId = createdMatchups.find(m => m.match_number === 1)?.id
    const _sfRightId = createdMatchups.find(m => m.match_number === 3)?.id
    const _finalId = createdMatchups.find(m => m.match_number === 1)?.id // Will be updated

    const { data: sfMatchups, error: sfError } = await supabaseAdmin
      .from('matchups')
      .insert([
        { season_id: seasonId, match_number: 5, round: 2, current_cp_a: CP_START, current_cp_b: CP_START, active: false, finished: false },
        { season_id: seasonId, match_number: 6, round: 2, current_cp_a: CP_START, current_cp_b: CP_START, active: false, finished: false },
        { season_id: seasonId, match_number: 7, round: 3, current_cp_a: CP_START, current_cp_b: CP_START, active: false, finished: false }
      ])
      .select('id, match_number')

    if (sfError || !sfMatchups) {
      console.error('Error creating SF/Final matchups:', sfError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // Update next_match_id links
    const finalMatchup = sfMatchups.find(m => m.match_number === 7)
    const sfLeftMatchup = sfMatchups.find(m => m.match_number === 5)
    const sfRightMatchup = sfMatchups.find(m => m.match_number === 6)

    // Update QF matchups to point to SF
    await supabaseAdmin
      .from('matchups')
      .update({ next_match_id: sfLeftMatchup?.id })
      .in('match_number', [1, 2])
      .eq('season_id', seasonId)

    await supabaseAdmin
      .from('matchups')
      .update({ next_match_id: sfRightMatchup?.id })
      .in('match_number', [3, 4])
      .eq('season_id', seasonId)

    // Update SF matchups to point to Final
    await supabaseAdmin
      .from('matchups')
      .update({ next_match_id: finalMatchup?.id })
      .in('match_number', [5, 6])
      .eq('season_id', seasonId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Seed quarterfinals error:', error)
    return NextResponse.json({ ok: false, code: 'InternalError' }, { status: 500 })
  }
}
