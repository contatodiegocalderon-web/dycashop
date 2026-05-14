import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Número de vitrine do pedido:
 * - Preferencialmente `orders.display_number` na BD (atribuído na criação, estável).
 * - Legado: posição na lista global de IDs (todos os estados), mais recentes primeiro;
 *   número = `length − índice` (o mais recente tem o maior número).
 */
export function normalizeOrderId(id: string): string {
  return String(id ?? "")
    .trim()
    .toLowerCase();
}

export function displayNumberFromOrderedIds(
  idsNewestFirst: string[],
  orderId: string
): number {
  const target = normalizeOrderId(orderId);
  const idx = idsNewestFirst.findIndex((x) => normalizeOrderId(x) === target);
  if (idx < 0) return 0;
  return idsNewestFirst.length - idx;
}

const PAGE_SIZE = 1000;

/** IDs de todos os pedidos, `created_at` DESC, desempate por `id` DESC (paginado — evita limite ~1000 do PostgREST). */
export async function fetchAllOrderIdsNewestFirst(): Promise<string[]> {
  const admin = createAdminClient();
  const all: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("orders")
      .select("id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return all;
    }
    const chunk = (data ?? []).map((r: { id: string }) => r.id);
    if (!chunk.length) break;
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/**
 * Número de vitrine só com contagens (alinhado a `fetchAllOrderIdsNewestFirst` + `displayNumberFromOrderedIds`).
 * Usado quando a lista paginada ainda não contém o `id` (replicação) ou como rede de segurança.
 */
async function computeDisplayNumberRank(orderId: string): Promise<number> {
  const id = normalizeOrderId(orderId);
  if (!id) return 0;

  const admin = createAdminClient();
  const { data: mine, error: e0 } = await admin
    .from("orders")
    .select("id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (e0 || !mine?.id || !mine?.created_at) return 0;

  const { count: total, error: e1 } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true });
  if (e1 || total == null || total === 0) return 0;

  const { count: newerByTime, error: e2 } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gt("created_at", mine.created_at);
  if (e2 || newerByTime == null) return 0;

  const { count: newerSameTime, error: e3 } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("created_at", mine.created_at)
    .gt("id", mine.id);
  if (e3 || newerSameTime == null) return 0;

  const k = newerByTime + newerSameTime;
  return total - k;
}

export async function fetchOrderDisplayNumberPublic(orderId: string): Promise<number> {
  const id = normalizeOrderId(orderId);
  if (!id) return 1;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("display_number")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) {
      const n = Number((data as { display_number?: unknown }).display_number);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* coluna ainda inexistente ou rede */
  }

  // Logo após o insert o pedido pode ainda não aparecer nas contagens/lista.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ids = await fetchAllOrderIdsNewestFirst();
    const n = displayNumberFromOrderedIds(ids, id);
    if (n > 0) return n;

    const rank = await computeDisplayNumberRank(id);
    if (rank > 0) return rank;

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  const last = await computeDisplayNumberRank(id);
  return last > 0 ? last : 1;
}

/** Anexa `display_number` a cada pedido (recibo e admin alinhados). */
export function attachDisplayNumbers<
  T extends { id: string; display_number?: number | null },
>(orders: T[], idsNewestFirst: string[]): (T & { display_number: number })[] {
  return orders.map((o) => {
    const persisted =
      typeof o.display_number === "number" &&
      Number.isFinite(o.display_number) &&
      o.display_number > 0
        ? o.display_number
        : null;
    return {
      ...o,
      display_number:
        persisted ??
        (idsNewestFirst.length
          ? displayNumberFromOrderedIds(idsNewestFirst, o.id) || 1
          : 1),
    };
  });
}
