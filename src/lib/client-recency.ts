/**
 * Semáforo de follow-up pós-compra (dias desde a última confirmação).
 * - Verde: menos de 30 dias — cliente em dia
 * - Amarelo: 30–59 dias — vendedor deve ligar (pós-compra)
 * - Vermelho: 60+ dias — vendedor deve reconverter o lead
 */
export type ClientRecencyStatus = "green" | "yellow" | "red" | "none";

/** Dias desde a compra até entrar em amarelo (inclusive). */
export const RECENCY_YELLOW_AFTER_DAYS = 30;

/** Dias desde a compra até entrar em vermelho (inclusive). */
export const RECENCY_RED_AFTER_DAYS = 60;

const MS_DAY = 24 * 60 * 60 * 1000;

const RECENCY_LABEL: Record<Exclude<ClientRecencyStatus, "none">, string> = {
  green: "Pós-compra em dia (< 30 dias)",
  yellow: "Follow-up pós-compra (30+ dias)",
  red: "Reconverter lead (60+ dias)",
};

export function daysSinceConfirmedAt(
  lastConfirmedAt: string,
  now = new Date()
): number {
  const last = new Date(lastConfirmedAt);
  if (Number.isNaN(last.getTime())) return NaN;
  const diff = now.getTime() - last.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_DAY);
}

export function clientRecencyStatus(
  lastConfirmedAt: string | null,
  now = new Date()
): ClientRecencyStatus {
  if (!lastConfirmedAt) return "none";
  const days = daysSinceConfirmedAt(lastConfirmedAt, now);
  if (!Number.isFinite(days)) return "none";

  if (days < RECENCY_YELLOW_AFTER_DAYS) return "green";
  if (days < RECENCY_RED_AFTER_DAYS) return "yellow";
  return "red";
}

export function clientRecencyLabel(status: ClientRecencyStatus): string {
  if (status === "none") return "Sem compra";
  return RECENCY_LABEL[status];
}
