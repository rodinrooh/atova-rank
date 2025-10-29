// supabase/functions/resolve_due_matchups/index.ts
// Deno Edge Function (Supabase) — resolves ONE matchup by ID using DB RPC
// No auto-start of next match. Pure, atomic, idempotent.

// @ts-ignore - Deno imports work at runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore - Deno imports work at runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    const { matchupId } = await req.json().catch(() => ({}));
    if (!matchupId) {
      return new Response(JSON.stringify({ error: "matchupId required" }), { status: 400 });
    }

    // @ts-ignore - Deno global available in Supabase Edge runtime
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // @ts-ignore - Deno global available in Supabase Edge runtime
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await supabase.rpc("resolve_match", {
      p_matchup_id: matchupId,
      p_source: "edge-fn"
    });

    if (error) {
      console.error("resolve_match RPC error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, result: data }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } catch (e) {
    console.error("Edge fn crash:", e);
    return new Response(JSON.stringify({ success: false, error: "internal-error" }), { status: 500 });
  }
});