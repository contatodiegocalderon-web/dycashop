/** Dias úteis após a última compra para sugerir follow-up de recompra. */
export const FOLLOW_UP_BUSINESS_DAYS = 5;

export type BusinessProfile = "lojista" | "revendedor" | "uso_proprio";

export type CrmClientProfileRow = {
  whatsapp_digits: string;
  business_profile: BusinessProfile | null;
};

export type CrmSellerFollowUpRow = {
  whatsapp_digits: string;
  staff_id: string;
  follow_up_completed_at: string;
};

const MS_DAY = 24 * 60 * 60 * 1000;

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Soma N dias úteis (seg–sex) a partir do instante de `start` (hora preservada). */
export function addBusinessDays(start: Date, businessDays: number): Date {
  const d = new Date(start.getTime());
  let added = 0;
  while (added < businessDays) {
    d.setTime(d.getTime() + MS_DAY);
    if (!isWeekend(d)) added += 1;
  }
  return d;
}

export function followUpDueAtIso(lastConfirmedAt: string): string {
  return addBusinessDays(
    new Date(lastConfirmedAt),
    FOLLOW_UP_BUSINESS_DAYS
  ).toISOString();
}

/**
 * Follow-up pendente quando:
 * - passaram 5+ dias úteis desde a última compra visível para o vendedor;
 * - ainda não houve follow-up registado após essa compra (nova compra reabre o ciclo).
 */
export function needsFollowUp(
  lastConfirmedAt: string | null,
  followUpCompletedAt: string | null
): boolean {
  if (!lastConfirmedAt) return false;

  if (
    followUpCompletedAt &&
    followUpCompletedAt >= lastConfirmedAt
  ) {
    return false;
  }

  const due = addBusinessDays(
    new Date(lastConfirmedAt),
    FOLLOW_UP_BUSINESS_DAYS
  );
  return Date.now() >= due.getTime();
}

export function sellerFollowUpKey(
  whatsappDigits: string,
  staffId: string
): string {
  return `${whatsappDigits}|${staffId}`;
}

export function followUpWhatsAppMessage(
  customerName: string | null | undefined
): string {
  const nome = customerName?.trim() ? customerName.trim().split(/\s+/)[0] : "";
  const hi = nome ? `Olá ${nome}!` : "Olá!";
  return `${hi} Tudo bem? Já faz alguns dias desde sua última compra conosco — como estão indo as vendas? Queremos entender melhor para preparar a próxima oferta para você.`;
}

export function isBusinessProfile(v: string | null | undefined): v is BusinessProfile {
  return v === "lojista" || v === "revendedor" || v === "uso_proprio";
}
