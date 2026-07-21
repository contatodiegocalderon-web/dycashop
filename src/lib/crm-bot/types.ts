export type CrmBotCampaignStatus =
  | "draft"
  | "connecting"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type CrmBotFunnelTab =
  | "abandonados"
  | "em_aberto"
  | "pos_30"
  | "pos_30_59"
  | "pos_60"
  | "manual";

export type CrmBotRecipientStatus = "pending" | "sent" | "failed" | "skipped";

export type CrmBotRecipientInput = {
  customer_whatsapp: string;
  customer_name: string | null;
};

export type CrmBotScheduleConfig = {
  secondsPerPerson: number;
  groupSize: number;
  groupPauseSeconds: number;
  variationCount: number;
};

export type CrmBotCampaignRow = {
  id: string;
  status: CrmBotCampaignStatus;
  funnel_tab: CrmBotFunnelTab;
  volume_tier: string;
  profile_filter: string;
  seller_scope: string;
  reference_message: string;
  media_base64: string | null;
  media_mimetype: string | null;
  seconds_per_person: number;
  group_size: number;
  group_pause_seconds: number;
  variation_count: number;
  evolution_instance: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CRM_BOT_FUNNEL_OPTIONS: Array<{
  value: CrmBotFunnelTab;
  label: string;
}> = [
  { value: "abandonados", label: "Etapa 1 · Abandonados" },
  { value: "em_aberto", label: "Etapa 2 · Em aberto" },
  { value: "pos_30", label: "Etapa 3 · Comprou < 30d" },
  { value: "pos_30_59", label: "Etapa 4 · 30–59 dias" },
  { value: "pos_60", label: "Etapa 5 · 60+ dias" },
];
