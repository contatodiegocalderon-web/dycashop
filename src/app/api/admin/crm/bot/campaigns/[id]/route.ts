import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
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
    const { data: campaign, error } = await admin
      .from("crm_bot_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
    }

    const { data: recipients, error: recErr } = await admin
      .from("crm_bot_recipients")
      .select(
        "id, customer_whatsapp, customer_name, status, error_message, scheduled_at, sent_at"
      )
      .eq("campaign_id", id)
      .order("scheduled_at", { ascending: true });

    if (recErr) throw new Error(recErr.message);

    const { count: pending } = await admin
      .from("crm_bot_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "pending");

    const { count: sent } = await admin
      .from("crm_bot_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "sent");

    const { count: failed } = await admin
      .from("crm_bot_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "failed");

    const { count: skipped } = await admin
      .from("crm_bot_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "skipped");

    return NextResponse.json({
      campaign,
      recipients: recipients ?? [],
      stats: {
        pending: pending ?? 0,
        sent: sent ?? 0,
        failed: failed ?? 0,
        skipped: skipped ?? 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
