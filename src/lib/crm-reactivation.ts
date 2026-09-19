/** Fila diária de reativação (tarefas de WhatsApp por etapa). */

export const REACTIVATION_STAGE5_BATCH = 5;

export type ReactivationCampaign =
  | "abandon_new"
  | "abandon_repeat"
  | "day20"
  | "day45"
  | "day60";

export const ABANDON_NEW_AFTER_DAYS = 5;
export const ABANDON_REPEAT_AFTER_DAYS = 7;
export const STAGE3_AFTER_DAYS = 20;
export const STAGE3_UNTIL_DAYS = 30;
export const STAGE4_AFTER_DAYS = 45;
export const STAGE4_UNTIL_DAYS = 60;
export const STAGE5_AFTER_DAYS = 60;

const MS_DAY = 24 * 60 * 60 * 1000;

export function isReactivationCampaign(
  v: string | null | undefined
): v is ReactivationCampaign {
  return (
    v === "abandon_new" ||
    v === "abandon_repeat" ||
    v === "day20" ||
    v === "day45" ||
    v === "day60"
  );
}

export function calendarDaysSince(iso: string, now = new Date()): number {
  const last = new Date(iso);
  if (Number.isNaN(last.getTime())) return NaN;
  const diff = now.getTime() - last.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_DAY);
}

export function paidCampaignForDays(days: number): ReactivationCampaign | null {
  if (!Number.isFinite(days)) return null;
  if (days >= STAGE5_AFTER_DAYS) return "day60";
  if (days >= STAGE4_AFTER_DAYS && days < STAGE4_UNTIL_DAYS) return "day45";
  if (days >= STAGE3_AFTER_DAYS && days < STAGE3_UNTIL_DAYS) return "day20";
  return null;
}

export function abandonCampaign(
  hasPaidBefore: boolean
): ReactivationCampaign {
  return hasPaidBefore ? "abandon_repeat" : "abandon_new";
}

export function isAbandonedDue(
  createdAt: string,
  hasPaidBefore: boolean,
  now = new Date()
): boolean {
  const days = calendarDaysSince(createdAt, now);
  if (!Number.isFinite(days)) return false;
  const need = hasPaidBefore
    ? ABANDON_REPEAT_AFTER_DAYS
    : ABANDON_NEW_AFTER_DAYS;
  return days >= need;
}

export function firstNameFromCustomer(
  name: string | null | undefined
): string {
  const n = name?.trim().split(/\s+/)[0];
  return n || "";
}

export function reactivationWhatsAppMessage(
  campaign: ReactivationCampaign,
  customerName: string | null | undefined
): string {
  const nome = firstNameFromCustomer(customerName);
  const hi = nome ? `Olá ${nome}!` : "Olá!";
  switch (campaign) {
    case "abandon_new":
      return `${hi} Tudo bem? Vi que você chegou a montar um pedido com a gente e ainda não fechou. Pode me contar o motivo? Estou à disposição pra te ajudar a vir pro time.`;
    case "abandon_repeat":
      return `${hi} Tudo bem? Vi que você deixou um pedido no carrinho. Consigo fazer um preço top pra você nessa — me chama que a gente fecha.`;
    case "day20":
      return `${hi} Tudo bem? Passando pra saber se o pedido chegou tudo certo e como estão as vendas. Qualquer coisa estou aqui.`;
    case "day45":
      return `${hi} Tudo bem? Consigo fazer um preço top pra você aproveitar e dar uma alavancada nas vendas. Me chama que eu te passo as condições.`;
    case "day60":
      return `${hi} Tudo bem? Vi que já faz um tempo que você comprou com a gente. Fechamos parceria com uma fábrica nova e agora consigo fazer um preço mais barato que qualquer outro fornecedor. Bora repor?`;
  }
}

export const CAMPAIGN_META: Record<
  ReactivationCampaign,
  { stage: string; title: string; stageNum: number; hint: string }
> = {
  abandon_new: {
    stage: "Etapa 1",
    title: "Nunca comprou",
    stageNum: 1,
    hint: "Perguntar o motivo e chamar pro time",
  },
  abandon_repeat: {
    stage: "Etapa 1",
    title: "Já é cliente",
    stageNum: 1,
    hint: "Oferecer preço top no carrinho",
  },
  day20: {
    stage: "Etapa 3",
    title: "Pós-compra",
    stageNum: 3,
    hint: "Chegou certo? Como estão as vendas?",
  },
  day45: {
    stage: "Etapa 4",
    title: "Reativação",
    stageNum: 4,
    hint: "Preço top pra alavancar vendas",
  },
  day60: {
    stage: "Etapa 5",
    title: "Inativo",
    stageNum: 5,
    hint: "Parceria nova · preço mais barato",
  },
};

export function campaignSortRank(campaign: ReactivationCampaign): number {
  switch (campaign) {
    case "abandon_new":
      return 0;
    case "abandon_repeat":
      return 1;
    case "day20":
      return 2;
    case "day45":
      return 3;
    case "day60":
      return 4;
  }
}

export function reactivationTaskKey(
  whatsappDigits: string,
  campaign: ReactivationCampaign,
  cycleAnchor: string
): string {
  return `${whatsappDigits}|${campaign}|${cycleAnchor}`;
}

export type ReactivationQueueTaskInput = {
  staffKey: string;
  campaign: ReactivationCampaign;
  sortAt: string;
};

/**
 * Etapa 5: no máximo N leads por vendedor. Os outros campanhas passam todos.
 * Dentro da etapa 5, entram os mais antigos primeiro.
 */
export function selectQueueTasks<T extends ReactivationQueueTaskInput>(
  due: T[],
  stage5Batch = REACTIVATION_STAGE5_BATCH
): { selected: T[]; stage5HiddenByStaff: Map<string, number> } {
  const hidden = new Map<string, number>();
  const day60: T[] = [];
  const rest: T[] = [];
  for (const t of due) {
    if (t.campaign === "day60") day60.push(t);
    else rest.push(t);
  }
  day60.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
  const taken60: T[] = [];
  const counts = new Map<string, number>();
  for (const t of day60) {
    const n = counts.get(t.staffKey) ?? 0;
    if (n < stage5Batch) {
      taken60.push(t);
      counts.set(t.staffKey, n + 1);
    } else {
      hidden.set(t.staffKey, (hidden.get(t.staffKey) ?? 0) + 1);
    }
  }
  return { selected: [...rest, ...taken60], stage5HiddenByStaff: hidden };
}

export function sortTasksForDisplay<
  T extends { campaign: ReactivationCampaign; sortAt: string; customer_name: string | null },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const r = campaignSortRank(a.campaign) - campaignSortRank(b.campaign);
    if (r !== 0) return r;
    const t = a.sortAt.localeCompare(b.sortAt);
    if (t !== 0) return t;
    return (a.customer_name ?? "").localeCompare(b.customer_name ?? "", "pt-BR");
  });
}

export function matchStaffByRequestedName(
  requested: string | null | undefined,
  staff: Array<{ id: string; full_name: string | null; email: string }>
): string | null {
  const raw = requested?.trim() ?? "";
  if (!raw || raw === "?" || raw === "SITE-VAREJO") return null;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const n = norm(raw);
  if (!n) return null;
  for (const s of staff) {
    const display =
      String(s.full_name ?? "").trim() ||
      String(s.email ?? "").split("@")[0] ||
      "";
    if (!display) continue;
    const dn = norm(display);
    if (dn === n || dn.startsWith(n) || n.startsWith(dn)) return s.id;
    const first = dn.split(/\s+/)[0] ?? "";
    const nFirst = n.split(/\s+/)[0] ?? "";
    if (first.length > 2 && first === nFirst) return s.id;
  }
  return null;
}
