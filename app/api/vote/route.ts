import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractClientIP, hashIP } from '@/lib/ip'
import { CP_PER_VOTE, VOTE_COOLDOWN_SECONDS } from '@/lib/constants'

interface VoteRequest {
  matchupId: string
  vcId: string
}

interface VoteResponse {
  ok: boolean
  newCp?: number
  code?: string
}

function validateVoteRequest(body: any): body is VoteRequest {
  return (
    body &&
    typeof body === 'object' &&
    typeof body.matchupId === 'string' &&
    typeof body.vcId === 'string'
  )
}

export async function POST(request: NextRequest) {
  try {
    console.log('🗳️ [API] POST /api/vote - Processing vote...')
    
    const body = await request.json()
    console.log('🗳️ [API] Vote request body:', body)
    
    if (!validateVoteRequest(body)) {
      console.log('🗳️ [API] Invalid vote request')
      return NextResponse.json({ ok: false, code: 'InvalidInput' }, { status: 400 })
    }

    const { matchupId, vcId } = body
    console.log('🗳️ [API] Processing vote for matchup:', matchupId, 'VC:', vcId)

    // Step 1: Verify the matchup is active and IDs match
    const { data: matchup, error: matchupError } = await supabaseAdmin
      .from('matchups')
      .select(`
        id,
        season_id,
        active,
        finished,
        vc_a_id,
        vc_b_id,
        current_cp_a,
        current_cp_b
      `)
      .eq('id', matchupId)
      .single()

    if (matchupError || !matchup) {
      return NextResponse.json({ ok: false, code: 'InvalidMatchupOrVC' }, { status: 400 })
    }

    if (!matchup.active || matchup.finished) {
      return NextResponse.json({ ok: false, code: 'InvalidMatchupOrVC' }, { status: 400 })
    }

    // Validate vcId is in this matchup
    if (matchup.vc_a_id !== vcId && matchup.vc_b_id !== vcId) {
      return NextResponse.json({ ok: false, code: 'InvalidMatchupOrVC' }, { status: 400 })
    }

    // Step 2: Compute ip_hash
    const clientIP = extractClientIP(request)
    const ipHash = hashIP(clientIP, matchup.season_id, matchupId)

    // Step 3: Enforce unique (matchup_id, ip_hash) - check if already voted
    const { data: existingVote, error: voteCheckError } = await supabaseAdmin
      .from('votes')
      .select('id')
      .eq('matchup_id', matchupId)
      .eq('ip_hash', ipHash)
      .single()

    if (voteCheckError && voteCheckError.code !== 'PGRST116') {
      console.error('Error checking existing vote:', voteCheckError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    if (existingVote) {
      return NextResponse.json({ ok: false, code: 'AlreadyVoted' }, { status: 409 })
    }

    // Step 4: Enforce cooldown - check last vote timestamp for same ip_hash in current matchup
    const { data: lastVote, error: cooldownError } = await supabaseAdmin
      .from('votes')
      .select('created_at')
      .eq('matchup_id', matchupId)
      .eq('ip_hash', ipHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (cooldownError && cooldownError.code !== 'PGRST116') {
      console.error('Error checking vote cooldown:', cooldownError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    if (lastVote) {
      const lastVoteTime = new Date(lastVote.created_at)
      const now = new Date()
      const timeDiffSeconds = (now.getTime() - lastVoteTime.getTime()) / 1000

      if (timeDiffSeconds < VOTE_COOLDOWN_SECONDS) {
        return NextResponse.json({ ok: false, code: 'Cooldown' }, { status: 429 })
      }
    }

    // Step 5: Insert vote record
    const { error: insertVoteError } = await supabaseAdmin
      .from('votes')
      .insert({
        season_id: matchup.season_id,
        matchup_id: matchupId,
        vc_id: vcId,
        ip_hash: ipHash
      })

    if (insertVoteError) {
      console.error('Error inserting vote:', insertVoteError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    // Step 6: Increment current_cp_a or current_cp_b by CP_PER_VOTE
    const isVcA = matchup.vc_a_id === vcId
    const newCpA = isVcA ? matchup.current_cp_a + CP_PER_VOTE : matchup.current_cp_a
    const newCpB = !isVcA ? matchup.current_cp_b + CP_PER_VOTE : matchup.current_cp_b

    const { error: updateCpError } = await supabaseAdmin
      .from('matchups')
      .update({
        current_cp_a: newCpA,
        current_cp_b: newCpB
      })
      .eq('id', matchupId)

    if (updateCpError) {
      console.error('Error updating CP:', updateCpError)
      return NextResponse.json({ ok: false, code: 'DatabaseError' }, { status: 500 })
    }

    const newCp = isVcA ? newCpA : newCpB

    const response: VoteResponse = {
      ok: true,
      newCp
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error in vote endpoint:', error)
    return NextResponse.json({ ok: false, code: 'InternalError' }, { status: 500 })
  }
}
