// app/api/resolve-match/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { matchupId } = await req.json();

    if (!matchupId) {
      return NextResponse.json({ ok: false, error: "matchupId required" }, { status: 400 });
    }

    // Server-side call to the Supabase Edge Function
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resolve_due_matchups`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
        },
        body: JSON.stringify({ matchupId })
      }
    );

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: json?.error ?? "edge-fn-failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: json.result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "internal-error" }, { status: 500 });
  }
}
