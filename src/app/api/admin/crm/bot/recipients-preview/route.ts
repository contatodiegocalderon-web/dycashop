import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin-auth";
import { loadCampaignRecipients } from "@/lib/crm-bot/recipients-db";
import type { CrmBotFunnelTab } from "@/lib/crm-bot/types";
import type { CrmProfileFilter } from "@/lib/crm-funnel";

export const runtime = "nodejs";

/** POST — prévia da quantidade de leads no grupo (sem criar campanha). */
export async function POST(request: NextRequest) {
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
    const body = (await request.json()) as Record<string, unknown>;
    const recipients = await loadCampaignRecipients({
      request,
      funnelTab: String(body.funnel_tab ?? "abandonados") as CrmBotFunnelTab,
      volumeTier: String(body.volume_tier ?? "all") as "all" | "atacado" | "varejo",
      profileFilter: String(body.profile_filter ?? "all") as CrmProfileFilter,
      sellerScope: String(body.seller_scope ?? "all"),
    });

    return NextResponse.json({
      count: recipients.length,
      sample: recipients.slice(0, 5),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
