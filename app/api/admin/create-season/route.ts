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

    const { name } = await request.json()

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Season name is required' }, { status: 400 })
    }

    // Create season
    const { data: season, error } = await supabaseAdmin
      .from('seasons')
      .insert({
        name,
        active: false,
        start_date: new Date().toISOString()
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating season:', error)
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      seasonId: season.id 
    })

  } catch (error) {
    console.error('Error in create-season endpoint:', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
