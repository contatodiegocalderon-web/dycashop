import type { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchEvolutionConnectionState,
  isEvolutionConfigured,
  sendEvolutionMedia,
  sendEvolutionText,
} from "@/lib/crm-bot/evolution";
import type { CrmBotCampaignRow } from "@/lib/crm-bot/types";

const MAX_SENDS_PER_TICK = 3;

export async function processCampaignTick(
  admin: ReturnType<typeof createAdminClient>,
  campaign: CrmBotCampaignRow
): Promise<{
  sentThisTick: number;
  pendingLeft: number;
  status: string;
  completed: boolean;
}> {
  if (campaign.status !== "running" && campaign.status !== "connecting") {
    return {
      sentThisTick: 0,
      pendingLeft: 0,
      status: campaign.status,
      completed: campaign.status === "completed",
    };
  }

  const instance = campaign.evolution_instance;
  if (!instance) {
    throw new Error("Instância WhatsApp não configurada.");
  }

  if (isEvolutionConfigured()) {
    const state = await fetchEvolutionConnectionState(instance);
    if (state !== "open") {
      await admin
        .from("crm_bot_campaigns")
        .update({
          status: "connecting",
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);
      return {
        sentThisTick: 0,
        pendingLeft: campaign.total_recipients - campaign.sent_count,
        status: "connecting",
        completed: false,
      };
    }
  }

  if (campaign.status === "connecting") {
    await admin
      .from("crm_bot_campaigns")
      .update({
        status: "running",
        started_at: campaign.started_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
  }

  const now = new Date().toISOString();
  const { data: dueRows, error: dueErr } = await admin
    .from("crm_bot_recipients")
    .select("id, customer_whatsapp, message_text")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_SENDS_PER_TICK);

  if (dueErr) throw new Error(dueErr.message);

  let sentThisTick = 0;

  for (const row of dueRows ?? []) {
    const r = row as {
      id: string;
      customer_whatsapp: string;
      message_text: string;
    };
    try {
      if (isEvolutionConfigured()) {
        if (campaign.media_base64 && campaign.media_mimetype) {
          await sendEvolutionMedia(instance, r.customer_whatsapp, {
            base64: campaign.media_base64,
            mimetype: campaign.media_mimetype,
            caption: r.message_text,
          });
        } else {
          await sendEvolutionText(instance, r.customer_whatsapp, r.message_text);
        }
      }
      await admin
        .from("crm_bot_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      sentThisTick += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      await admin
        .from("crm_bot_recipients")
        .update({ status: "failed", error_message: msg })
        .eq("id", r.id);
      await admin
        .from("crm_bot_campaigns")
        .update({
          failed_count: (campaign.failed_count ?? 0) + 1,
          last_error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);
    }
  }

  const { count: pendingLeft } = await admin
    .from("crm_bot_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "pending");

  const { count: sentTotal } = await admin
    .from("crm_bot_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "sent");

  const left = pendingLeft ?? 0;
  const sent = sentTotal ?? 0;

  if (left === 0) {
    await admin
      .from("crm_bot_campaigns")
      .update({
        status: "completed",
        sent_count: sent,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    return { sentThisTick, pendingLeft: 0, status: "completed", completed: true };
  }

  await admin
    .from("crm_bot_campaigns")
    .update({
      sent_count: sent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return {
    sentThisTick,
    pendingLeft: left,
    status: "running",
    completed: false,
  };
}
