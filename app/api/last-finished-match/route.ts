import { NextResponse } from 'next/server';
// NOTE: Adjust this import to your actual admin client export/path:
import { supabaseAdmin } from '@/lib/supabase-admin';

// Minimal shape we return — adjust fields if your UI expects more.
type LastFinishedMatch = {
  id: string;
  vcAId: string | null;
  vcBId: string | null;
  winnerId: string | null;
  finishedAt: string | null; // ISO string
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('id, vc_a_id, vc_b_id, winner_id, finished_at')
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const row = data && data[0];
    if (!row) {
      return NextResponse.json({ ok: true, match: null }, { status: 200 });
    }

    const result: LastFinishedMatch = {
      id: String(row.id),
      vcAId: row.vc_a_id ?? null,
      vcBId: row.vc_b_id ?? null,
      winnerId: row.winner_id ?? null,
      finishedAt: row.finished_at ?? null,
    };

    return NextResponse.json({ ok: true, match: result }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}