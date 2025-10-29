// app/api/admin/start-next-match/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const HOURS_72_MS = 72 * 60 * 60 * 1000;

export async function POST(_req: NextRequest) {
  // 1) There must be NO active match
  const { data: active, error: activeErr } = await supabaseAdmin
    .from("matchups")
    .select("id")
    .eq("active", true)
    .eq("finished", false)
    .limit(1);

  if (activeErr) {
    return NextResponse.json({ ok: false, error: activeErr.message }, { status: 500 });
  }
  if (active && active.length > 0) {
    return NextResponse.json({ ok: false, error: "active-match-exists" }, { status: 409 });
  }

  // 2) Find the next match in progression (not started, not finished, both slots ready if your logic requires)
  const { data: nextMatch, error: nextErr } = await supabaseAdmin
    .from("matchups")
    .select("*")
    .eq("finished", false)
    .eq("active", false)
    .order("match_number", { ascending: true })
    .limit(1);

  if (nextErr) {
    return NextResponse.json({ ok: false, error: nextErr.message }, { status: 500 });
  }
  if (!nextMatch || nextMatch.length === 0) {
    return NextResponse.json({ ok: false, error: "no-next-match" }, { status: 404 });
  }

  const m = nextMatch[0];

  // 3) Activate for exactly 72 hours
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + HOURS_72_MS);

  const { error: updErr } = await supabaseAdmin
    .from("matchups")
    .update({
      active: true,
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString()
    })
    .eq("id", m.id);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchId: m.id, startedAt, endsAt });
}