import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lista global: todos os pedidos (pendentes, pagos, cancelados), mais recentes primeiro.
 * Número exibido = `length − índice` → o pedido mais recente tem o maior número;
 * cada pedido tem um número único que nunca é reutilizado.
 */
export function displayNumberFromOrderedIds(
  idsNewestFirst: string[],
  orderId: string
): number {
  const idx = idsNewestFirst.indexOf(orderId);
  if (idx < 0) return 0;
  return idsNewestFirst.length - idx;
}

/** IDs de todos os pedidos, `created_at` DESC, desempate por `id` DESC. */
export async function fetchAllOrderIdsNewestFirst(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r: { id: string }) => r.id);
}

export async function fetchOrderDisplayNumberPublic(
  orderId: string
): Promise<number> {
  const ids = await fetchAllOrderIdsNewestFirst();
  const n = displayNumberFromOrderedIds(ids, orderId);
  return n > 0 ? n : 1;
}

/** Anexa `display_number` a cada pedido (recibo e admin alinhados). */
export function attachDisplayNumbers<T extends { id: string }>(
  orders: T[],
  idsNewestFirst: string[]
): (T & { display_number: number })[] {
  return orders.map((o) => ({
    ...o,
    display_number: displayNumberFromOrderedIds(idsNewestFirst, o.id) || 1,
  }));
}
