import type { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchEvolutionConnectionState,
  isEvolutionConfigured,
  sendEvolutionMedia,
  sendEvolutionText,
} from "@/lib/crm-bot/evolution";
import type { CrmBotCampaignRow } from "@/lib/crm-bot/types";

/** Um envio por tick — o intervalo real vem de scheduled_at (seconds_per_person). */
const MAX_SENDS_PER_TICK = 1;

/** Claims órfãos (crash a meio) liberam após este tempo. */
const STALE_CLAIM_MS = 2 * 60 * 1000;

type Admin = ReturnType<typeof createAdminClient>;

type RecipientRow = {
  id: string;
  customer_whatsapp: string;
  message_text: string;
  error_message: string | null;
};

function makeClaimToken(): string {
  return `claim:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function claimAgeMs(errorMessage: string | null): number | null {
  const m = /^claim:(\d+):/.exec(errorMessage ?? "");
  if (!m) return null;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts)) return null;
  return Date.now() - ts;
}

async function releaseStaleClaims(admin: Admin, campaignId: string) {
  const { data: rows, error } = await admin
    .from("crm_bot_recipients")
    .select("id, error_message")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .like("error_message", "claim:%")
    .limit(50);

  if (error || !rows?.length) return;

  for (const row of rows as Array<{ id: string; error_message: string | null }>) {
    const age = claimAgeMs(row.error_message);
    if (age == null || age < STALE_CLAIM_MS) continue;
    await admin
      .from("crm_bot_recipients")
      .update({
        error_message: null,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .like("error_message", "claim:%");
  }
}

/**
 * Reserva atomicamente o próximo destinatário due.
 * Usa error_message como token de claim (sem alterar o CHECK de status).
 * Dois ticks em paralelo: só um consegue o update com error_message IS NULL.
 */
async function claimNextDueRecipient(
  admin: Admin,
  campaignId: string
): Promise<(RecipientRow & { claimToken: string }) | null> {
  const now = new Date().toISOString();
  const { data: dueRows, error: dueErr } = await admin
    .from("crm_bot_recipients")
    .select("id, customer_whatsapp, message_text, error_message")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .is("error_message", null)
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (dueErr) throw new Error(dueErr.message);
  const candidate = (dueRows?.[0] ?? null) as RecipientRow | null;
  if (!candidate) return null;

  const claimToken = makeClaimToken();
  const { data: claimed, error: claimErr } = await admin
    .from("crm_bot_recipients")
    .update({ error_message: claimToken })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .is("error_message", null)
    .select("id, customer_whatsapp, message_text, error_message")
    .maybeSingle();

  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) return null;
  return { ...(claimed as RecipientRow), claimToken };
}

export async function processCampaignTick(
  admin: Admin,
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

  await releaseStaleClaims(admin, campaign.id);

  let sentThisTick = 0;

  for (let i = 0; i < MAX_SENDS_PER_TICK; i += 1) {
    const r = await claimNextDueRecipient(admin, campaign.id);
    if (!r) break;

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
      const { data: marked } = await admin
        .from("crm_bot_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", r.id)
        .eq("status", "pending")
        .eq("error_message", r.claimToken)
        .select("id")
        .maybeSingle();

      // Outro worker já processou — não conta de novo
      if (marked) sentThisTick += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      await admin
        .from("crm_bot_recipients")
        .update({ status: "failed", error_message: msg })
        .eq("id", r.id)
        .eq("status", "pending")
        .eq("error_message", r.claimToken);
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
