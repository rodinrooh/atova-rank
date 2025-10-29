import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkAdminAccess } from '@/lib/auth'
import { CP_START, MATCH_DURATION_HOURS, TIE_BREAK_METHOD } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { allowed } = await checkAdminAccess()
    if (!allowed) {
      return NextResponse.json({ ok: false, code: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { matchupId } = body

    if (!matchupId) {
      return NextResponse.json({ ok: false, code: 'InvalidInput' }, { status: 400 })
    }

    // Get the active matchup
    const { data: matchup, error: matchupError } = await supabaseAdmin
      .from('matchups')
      .select(`
        id, 
        season_id, 
        match_number, 
        active, 
        finished, 
        current_cp_a, 
        current_cp_b, 
        vc_a_id, 
        vc_b_id, 
        next_match_id
      `)
      .eq('id', matchupId)
      .single()

    if (matchupError || !matchup) {
      return NextResponse.json({ ok: false, code: 'MatchupNotFound' }, { status: 404 })
    }

    if (!matchup.active || matchup.finished) {
      return NextResponse.json({ ok: false, code: 'MatchupNotActive' }, { status: 400 })
    }

    // Determine winner
    let winnerId: string
    let tieBreakRandom = false

    if (matchup.current_cp_a > matchup.current_cp_b) {
      winnerId = matchup.vc_a_id!
    } else if (matchup.current_cp_b > matchup.current_cp_a) {
      winnerId = matchup.vc_b_id!
    } else {
      // Tie - random winner
      tieBreakRandom = true
      const randomValue = crypto.getRandomValues(new Uint32Array(1))[0] % 2
      winnerId = randomValue === 0 ? matchup.vc_a_id! : matchup.vc_b_id!
    }

    const loserId = winnerId === matchup.vc_a_id ? matchup.vc_b_id! : matchup.vc_a_id!

    // Update the finished matchup
    const { error: updateMatchupError } = await supabaseAdmin
      .from('matchups')
      .update({
        finished: true,
        active: false,
        final_cp_a: matchup.current_cp_a,
        final_cp_b: matchup.current_cp_b,
        winner_id: winnerId,
        tie_break_random: tieBreakRandom
      })
      .eq('id', matchupId)

    if (updateMatchupError) {
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // Mark loser as eliminated
    const { error: eliminateError } = await supabaseAdmin
      .from('vcs')
      .update({ eliminated: true })
      .eq('id', loserId)

    if (eliminateError) {
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // If this is the final match (match #7), we're done
    if (matchup.match_number === 7) {
      return NextResponse.json({ ok: true })
    }

    // Slot winner into next match
    if (matchup.next_match_id) {
      const { data: nextMatch, error: nextMatchError } = await supabaseAdmin
        .from('matchups')
        .select('id, vc_a_id, vc_b_id')
        .eq('id', matchup.next_match_id)
        .single()

      if (nextMatchError || !nextMatch) {
        return NextResponse.json({ ok: false, code: 'NextMatchNotFound' }, { status: 500 })
      }

      // Determine which slot to fill
      let updateData: any
      if (nextMatch.vc_a_id === null) {
        updateData = { vc_a_id: winnerId }
      } else if (nextMatch.vc_b_id === null) {
        updateData = { vc_b_id: winnerId }
      } else {
        // Both slots filled, start the next match
        const startedAt = new Date()
        const endsAt = new Date(startedAt.getTime() + MATCH_DURATION_HOURS * 60 * 60 * 1000)

        updateData = {
          started_at: startedAt.toISOString(),
          ends_at: endsAt.toISOString(),
          active: true,
          finished: false,
          current_cp_a: CP_START,
          current_cp_b: CP_START
        }
      }

      const { error: slotError } = await supabaseAdmin
        .from('matchups')
        .update(updateData)
        .eq('id', matchup.next_match_id)

      if (slotError) {
        return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
      }

      // If we just started the next match, ensure no other active matches
      if (updateData.active) {
        const { error: deactivateError } = await supabaseAdmin
          .from('matchups')
          .update({ active: false })
          .eq('season_id', matchup.season_id)
          .neq('id', matchup.next_match_id)

        if (deactivateError) {
          return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Force end error:', error)
    return NextResponse.json({ ok: false, code: 'InternalError' }, { status: 500 })
  }
}
