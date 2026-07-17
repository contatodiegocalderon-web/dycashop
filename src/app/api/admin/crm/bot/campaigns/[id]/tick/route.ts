import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { processCampaignTick } from "@/lib/crm-bot/dispatch";
import {
  fetchEvolutionConnectionState,
  isEvolutionConfigured,
} from "@/lib/crm-bot/evolution";
import type { CrmBotCampaignRow } from "@/lib/crm-bot/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST — processa envios pendentes (poll a cada ~5s no cliente). */
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
    const { data: campaign, error } = await admin
      .from("crm_bot_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
    }

    const row = campaign as CrmBotCampaignRow;

    if (row.status === "cancelled" || row.status === "completed") {
      return NextResponse.json({
        ok: true,
        status: row.status,
        completed: row.status === "completed",
      });
    }

    let connectionState: string | null = null;
    if (isEvolutionConfigured() && row.evolution_instance) {
      connectionState = await fetchEvolutionConnectionState(row.evolution_instance);
    }

    const result = await processCampaignTick(admin, row);

    const { data: updated } = await admin
      .from("crm_bot_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      ...result,
      connectionState,
      campaign: updated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
