import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { resolvePrincipal } from "@/lib/access";
import { loadCampaignRecipients } from "@/lib/crm-bot/recipients-db";
import {
  buildMessageVariations,
  computeScheduledTimes,
  groupIndexForPosition,
} from "@/lib/crm-bot/variations";
import type { CrmBotFunnelTab } from "@/lib/crm-bot/types";
import type { CrmProfileFilter } from "@/lib/crm-funnel";

export const runtime = "nodejs";

/** POST — cria campanha + fila de destinatários. GET — campanha ativa. */
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
    const referenceMessage = String(body.reference_message ?? "").trim();
    if (!referenceMessage) {
      return NextResponse.json(
        { error: "Mensagem de referência é obrigatória." },
        { status: 400 }
      );
    }

    const rawRecipients = body.recipients;
    let recipients: Array<{
      customer_whatsapp: string;
      customer_name: string | null;
    }>;
    let funnelTab: CrmBotFunnelTab;
    let volumeTier: string;
    let profileFilter: CrmProfileFilter;
    let sellerScope: string;

    if (Array.isArray(rawRecipients) && rawRecipients.length > 0) {
      const deduped = new Map<
        string,
        { customer_whatsapp: string; customer_name: string | null }
      >();
      for (const row of rawRecipients) {
        if (!row || typeof row !== "object") continue;
        const wa = String(
          (row as { customer_whatsapp?: string }).customer_whatsapp ?? ""
        ).replace(/\D/g, "");
        if (wa.length < 10) continue;
        const name =
          typeof (row as { customer_name?: string | null }).customer_name ===
          "string"
            ? (row as { customer_name: string }).customer_name.trim() || null
            : null;
        deduped.set(wa, { customer_whatsapp: wa, customer_name: name });
      }
      recipients = Array.from(deduped.values());
      funnelTab = "manual";
      volumeTier = "manual";
      profileFilter = "all";
      sellerScope = String(body.seller_scope ?? "all");
    } else {
      funnelTab = String(body.funnel_tab ?? "") as CrmBotFunnelTab;
      volumeTier = String(body.volume_tier ?? "all");
      profileFilter = String(body.profile_filter ?? "all") as CrmProfileFilter;
      sellerScope = String(body.seller_scope ?? "all");
      recipients = await loadCampaignRecipients({
        request,
        funnelTab,
        volumeTier: volumeTier as "all" | "atacado" | "varejo",
        profileFilter,
        sellerScope,
      });
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Selecione ao menos um lead no funil." },
        { status: 400 }
      );
    }

    const secondsPerPerson = Math.max(3, Number(body.seconds_per_person) || 10);
    const groupSize = Math.max(1, Number(body.group_size) || 10);
    const groupPauseSeconds = Math.max(
      0,
      Number(body.group_pause_seconds) || 1800
    );
    const variationCount = Math.max(1, Number(body.variation_count) || 3);
    const mediaBase64 =
      typeof body.media_base64 === "string" && body.media_base64.trim()
        ? body.media_base64.trim()
        : null;
    const mediaMimetype =
      typeof body.media_mimetype === "string" ? body.media_mimetype.trim() : null;

    const messages = buildMessageVariations(referenceMessage, recipients, {
      secondsPerPerson,
      groupSize,
      groupPauseSeconds,
      variationCount: Math.min(variationCount, recipients.length),
    });
    const schedule = computeScheduledTimes(recipients.length, {
      secondsPerPerson,
      groupSize,
      groupPauseSeconds,
      variationCount,
    });

    const principal = await resolvePrincipal(request);
    const staffId =
      principal?.kind === "staff" ? principal.staff.staffId : null;

    const admin = createAdminClient();
    const { data: campaign, error: cErr } = await admin
      .from("crm_bot_campaigns")
      .insert({
        created_by_staff_id: staffId,
        status: "draft",
        funnel_tab: funnelTab,
        volume_tier: volumeTier,
        profile_filter: profileFilter,
        seller_scope: sellerScope,
        reference_message: referenceMessage,
        media_base64: mediaBase64,
        media_mimetype: mediaMimetype,
        seconds_per_person: secondsPerPerson,
        group_size: groupSize,
        group_pause_seconds: groupPauseSeconds,
        variation_count: Math.min(variationCount, recipients.length),
        total_recipients: recipients.length,
      })
      .select("*")
      .single();

    if (cErr) {
      const missing = /does not exist|schema cache|relation/i.test(cErr.message);
      return NextResponse.json(
        {
          error: cErr.message,
          hint: missing
            ? "Execute supabase/migration_crm_bot_campaigns.sql no Supabase."
            : undefined,
        },
        { status: missing ? 503 : 500 }
      );
    }

    const recipientRows = recipients.map((r, i) => ({
      campaign_id: (campaign as { id: string }).id,
      customer_whatsapp: r.customer_whatsapp,
      customer_name: r.customer_name,
      message_text: messages[i] ?? referenceMessage,
      group_index: groupIndexForPosition(i, groupSize),
      scheduled_at: schedule[i]!.toISOString(),
      status: "pending",
    }));

    for (let i = 0; i < recipientRows.length; i += 100) {
      const chunk = recipientRows.slice(i, i + 100);
      const { error: rErr } = await admin.from("crm_bot_recipients").insert(chunk);
      if (rErr) throw new Error(rErr.message);
    }

    return NextResponse.json({
      campaign,
      preview: {
        total: recipients.length,
        sampleMessages: messages.slice(0, 3),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_bot_campaigns")
      .select("*")
      .in("status", ["draft", "connecting", "running", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const missing = /does not exist|schema cache|relation/i.test(error.message);
      if (missing) return NextResponse.json({ campaign: null });
      throw new Error(error.message);
    }

    return NextResponse.json({ campaign: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
