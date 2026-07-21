import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST — cancela campanha em andamento. */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status }
    );
  }

  try {
    const { id } = await ctx.params;
    const admin = createAdminClient();

    await admin
      .from("crm_bot_recipients")
      .update({ status: "skipped" })
      .eq("campaign_id", id)
      .eq("status", "pending");

    const { data, error } = await admin
      .from("crm_bot_campaigns")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, campaign: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
