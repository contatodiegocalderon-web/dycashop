import type { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchEvolutionConnectionState,
  isEvolutionConfigured,
  sendEvolutionMedia,
  sendEvolutionText,
} from "@/lib/crm-bot/evolution";
import type { CrmBotCampaignRow } from "@/lib/crm-bot/types";

/** Um envio por tick — intervalo real medido desde o último envio. */
const MAX_SENDS_PER_TICK = 1;

/** Claims órfãos (crash a meio) liberam após este tempo. */
const STALE_CLAIM_MS = 2 * 60 * 1000;

type Admin = ReturnType<typeof createAdminClient>;

type RecipientRow = {
  id: string;
  customer_whatsapp: string;
  message_text: string;
  error_message: string | null;
  group_index: number;
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

async function releaseClaim(
  admin: Admin,
  recipientId: string,
  claimToken: string
) {
  await admin
    .from("crm_bot_recipients")
    .update({ error_message: null })
    .eq("id", recipientId)
    .eq("status", "pending")
    .eq("error_message", claimToken);
}

/**
 * Intervalo desde o último envio real (não o horário pré-agendado na criação).
 * Assim o tempo do QR / conexão não “come” o espaçamento entre mensagens.
 */
function gapSecondsForNext(
  campaign: CrmBotCampaignRow,
  lastGroupIndex: number | null,
  nextGroupIndex: number
): number {
  if (lastGroupIndex == null) return 0;
  if (nextGroupIndex !== lastGroupIndex) {
    return Math.max(0, Number(campaign.group_pause_seconds) || 0);
  }
  return Math.max(3, Number(campaign.seconds_per_person) || 10);
}

/**
 * Reserva o próximo da fila só se o intervalo desde o último envio já passou.
 */
async function claimNextDueRecipient(
  admin: Admin,
  campaign: CrmBotCampaignRow
): Promise<(RecipientRow & { claimToken: string }) | null> {
  const { data: nextRows, error: nextErr } = await admin
    .from("crm_bot_recipients")
    .select("id, customer_whatsapp, message_text, error_message, group_index")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .is("error_message", null)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (nextErr) throw new Error(nextErr.message);
  const candidate = (nextRows?.[0] ?? null) as RecipientRow | null;
  if (!candidate) return null;

  const { data: lastRows, error: lastErr } = await admin
    .from("crm_bot_recipients")
    .select("sent_at, group_index")
    .eq("campaign_id", campaign.id)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (lastErr) throw new Error(lastErr.message);
  const last = (lastRows?.[0] ?? null) as {
    sent_at: string;
    group_index: number;
  } | null;

  if (last?.sent_at) {
    const gapSec = gapSecondsForNext(
      campaign,
      last.group_index,
      candidate.group_index
    );
    const readyAt = new Date(last.sent_at).getTime() + gapSec * 1000;
    if (Date.now() < readyAt) {
      return null;
    }
  }

  const claimToken = makeClaimToken();
  const { data: claimed, error: claimErr } = await admin
    .from("crm_bot_recipients")
    .update({ error_message: claimToken })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .is("error_message", null)
    .select("id, customer_whatsapp, message_text, error_message, group_index")
    .maybeSingle();

  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) return null;

  // Revalida intervalo após o claim (evita 2 abas furarem o gap).
  const { data: lastAfter } = await admin
    .from("crm_bot_recipients")
    .select("id, sent_at, group_index")
    .eq("campaign_id", campaign.id)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);

  const last2 = (lastAfter?.[0] ?? null) as {
    id: string;
    sent_at: string;
    group_index: number;
  } | null;

  if (last2?.sent_at && last2.id !== claimed.id) {
    const gapSec = gapSecondsForNext(
      campaign,
      last2.group_index,
      (claimed as RecipientRow).group_index
    );
    const readyAt = new Date(last2.sent_at).getTime() + gapSec * 1000;
    if (Date.now() < readyAt) {
      await releaseClaim(admin, claimed.id, claimToken);
      return null;
    }
  }

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
  nextSendInSeconds?: number | null;
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
    const r = await claimNextDueRecipient(admin, campaign);
    if (!r) break;

    const attemptedAt = new Date().toISOString();
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
          sent_at: attemptedAt,
          error_message: null,
        })
        .eq("id", r.id)
        .eq("status", "pending")
        .eq("error_message", r.claimToken)
        .select("id")
        .maybeSingle();

      if (marked) sentThisTick += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      // sent_at marca o instante da tentativa — serve de âncora do intervalo
      await admin
        .from("crm_bot_recipients")
        .update({
          status: "failed",
          error_message: msg,
          sent_at: attemptedAt,
        })
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

  let nextSendInSeconds: number | null = null;
  if (left > 0) {
    const { data: nextRows } = await admin
      .from("crm_bot_recipients")
      .select("group_index")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .is("error_message", null)
      .order("scheduled_at", { ascending: true })
      .limit(1);
    const { data: lastRows } = await admin
      .from("crm_bot_recipients")
      .select("sent_at, group_index")
      .eq("campaign_id", campaign.id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    const next = nextRows?.[0] as { group_index: number } | undefined;
    const last = lastRows?.[0] as
      | { sent_at: string; group_index: number }
      | undefined;
    if (next && last?.sent_at) {
      const gapSec = gapSecondsForNext(
        campaign,
        last.group_index,
        next.group_index
      );
      const readyAt = new Date(last.sent_at).getTime() + gapSec * 1000;
      nextSendInSeconds = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
    } else {
      nextSendInSeconds = 0;
    }
  }

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
    return {
      sentThisTick,
      pendingLeft: 0,
      status: "completed",
      completed: true,
      nextSendInSeconds: null,
    };
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
    nextSendInSeconds,
  };
}
