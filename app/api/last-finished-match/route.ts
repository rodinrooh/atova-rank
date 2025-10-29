// app/api/last-finished-match/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("matchups")
    .select(`
      id,
      match_number,
      round,
      winner_id,
      final_cp_a,
      final_cp_b,
      updated_at,
      vc_a:vcs!matchups_vc_a_id_fkey ( id, name ),
      vc_b:vcs!matchups_vc_b_id_fkey ( id, name )
    `)
    .eq("finished", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ ok: false });
  }

  const m = data[0];

  const winner =
    m.winner_id === (m.vc_a as any)?.id ? m.vc_a :
    m.winner_id === (m.vc_b as any)?.id ? m.vc_b : null;

  return NextResponse.json({
    ok: true,
    match: {
      id: m.id,
      matchNumber: m.match_number,
      round: m.round,
      winner,
      finalScores: {
        vcA: { id: (m.vc_a as any)?.id, name: (m.vc_a as any)?.name, cp: m.final_cp_a },
        vcB: { id: (m.vc_b as any)?.id, name: (m.vc_b as any)?.name, cp: m.final_cp_b }
      }
    }
  });
}
