// app/api/admin/test-end-in-1m/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";

export async function POST() {
  // Find active match
  const { data, error } = await supabaseAdmin
    .from("matchups")
    .select("id")
    .eq("active", true)
    .eq("finished", false)
    .limit(1);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "no-active-match" }, { status: 404 });
  }

  const id = data[0].id;
  const endsAt = new Date(Date.now() + 60_000).toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("matchups")
    .update({ ends_at: endsAt })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, endsAt });
}
