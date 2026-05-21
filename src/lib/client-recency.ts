/** Semáforo de recompra com base no mês da última compra confirmada. */
export type ClientRecencyStatus = "green" | "yellow" | "red" | "none";

const RECENCY_LABEL: Record<Exclude<ClientRecencyStatus, "none">, string> = {
  green: "Comprou este mês",
  yellow: "Última compra há 1 mês",
  red: "Última compra há 2+ meses",
};

export function clientRecencyStatus(
  lastConfirmedAt: string | null,
  now = new Date()
): ClientRecencyStatus {
  if (!lastConfirmedAt) return "none";
  const last = new Date(lastConfirmedAt);
  if (Number.isNaN(last.getTime())) return "none";

  const monthsDiff =
    (now.getFullYear() - last.getFullYear()) * 12 +
    (now.getMonth() - last.getMonth());

  if (monthsDiff <= 0) return "green";
  if (monthsDiff === 1) return "yellow";
  return "red";
}

export function clientRecencyLabel(status: ClientRecencyStatus): string {
  if (status === "none") return "Sem compra";
  return RECENCY_LABEL[status];
}
