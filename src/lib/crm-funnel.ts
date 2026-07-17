/** Peças mínimas para considerar pedido/carrinho como atacado. */
export const CRM_ATACADO_MIN_PIECES = 5;

/** Cards visíveis antes do botão «Ver mais» em cada coluna do pipeline. */
export const CRM_COLUMN_PREVIEW = 8;

export type CrmVolumeTier = "atacado" | "varejo";

export type CrmFunnelTab =
  | "abandonados"
  | "em_aberto"
  | "pos_30"
  | "pos_30_59"
  | "pos_60"
  | "mapa";

export type CrmProfileFilter =
  | "all"
  | "lojista"
  | "revendedor"
  | "uso_proprio"
  | "sem_perfil";

export const CRM_ABANDONED_FOLLOW_UP_MAX = 3;

export function totalPiecesFromItems(items: { quantity: number }[]): number {
  return items.reduce(
    (sum, it) => sum + Math.max(0, Number(it.quantity) || 0),
    0
  );
}

export function volumeTierFromPieces(pieces: number): CrmVolumeTier {
  return pieces >= CRM_ATACADO_MIN_PIECES ? "atacado" : "varejo";
}

export function volumeTierLabel(tier: CrmVolumeTier): string {
  return tier === "atacado" ? "Atacado (5+ peças)" : "Varejo (< 5 peças)";
}

export function nextFollowUpLabel(count: number): string | null {
  if (count >= CRM_ABANDONED_FOLLOW_UP_MAX) return null;
  return `Follow-up ${count + 1} de ${CRM_ABANDONED_FOLLOW_UP_MAX}`;
}

export function followUpAlertClass(count: number): string {
  if (count >= CRM_ABANDONED_FOLLOW_UP_MAX) {
    return "border-stone-200 bg-stone-50 text-stone-500";
  }
  if (count >= 2) {
    return "border-red-200 bg-red-50 text-red-900";
  }
  if (count >= 1) {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-violet-200 bg-violet-50 text-violet-950";
}

export function matchesProfileFilter(
  profile: string | null | undefined,
  filter: CrmProfileFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "sem_perfil") return !profile;
  return profile === filter;
}

/** Clientes que já compraram antes aparecem primeiro nas etapas 1 e 2. */
export function sortLeadsRepeatBuyersFirst<
  T extends { has_paid_before: boolean; created_at: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const prio = Number(b.has_paid_before) - Number(a.has_paid_before);
    if (prio !== 0) return prio;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}
