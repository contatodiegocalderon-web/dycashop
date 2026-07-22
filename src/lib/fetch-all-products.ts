import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1000;

function ensureIdColumn(columns: string): string {
  const parts = columns
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!parts.some((c) => c === "id")) {
    parts.unshift("id");
  }
  return parts.join(", ");
}

/** Cliente anon (mesmas credenciais públicas do catálogo / `/api/products`). */
export function createCatalogAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getProductsTableCount(
  client: SupabaseClient
): Promise<number> {
  const { count, error } = await client
    .from("products")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Lista todos os produtos com paginação estável por `id` (keyset).
 * Ordenar só por colunas não-únicas faz saltar/duplicar linhas entre páginas no PostgREST.
 */
export async function fetchAllProductsPaginated<T extends Record<string, unknown>>(
  client: SupabaseClient,
  columns: string
): Promise<T[]> {
  const selectCols = ensureIdColumn(columns);
  const all: T[] = [];
  let lastId: string | null = null;

  for (;;) {
    let q = client
      .from("products")
      .select(selectCols)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId) {
      q = q.gt("id", lastId);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as unknown as T[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;

    const tail = chunk[chunk.length - 1] as { id?: string };
    if (!tail?.id) {
      throw new Error("Paginação de produtos interrompida: coluna id ausente no lote.");
    }
    lastId = tail.id;
  }

  return all;
}

/**
 * Lê o catálogo completo para inventário. Prefere service role; se a chave admin
 * na Vercel estiver desatualizada (contagem menor que o anon público), faz fallback
 * para o cliente anon — o mesmo caminho que `/api/products` usa em produção.
 */
export async function fetchAllProductsForInventory<T extends Record<string, unknown>>(
  columns: string
): Promise<{ rows: T[]; readVia: "service_role" | "anon_fallback"; expectedCount: number }> {
  const admin = createAdminClient();
  const anon = createCatalogAnonClient();

  const [adminCount, anonCount] = await Promise.all([
    getProductsTableCount(admin),
    getProductsTableCount(anon),
  ]);

  if (anonCount > adminCount) {
    const rows = await fetchAllProductsPaginated<T>(anon, columns);
    if (rows.length !== anonCount) {
      throw new Error(
        `Leitura anon incompleta: ${rows.length}/${anonCount} produtos. Verifique RLS ou paginação.`
      );
    }
    return { rows, readVia: "anon_fallback", expectedCount: anonCount };
  }

  const rows = await fetchAllProductsPaginated<T>(admin, columns);
  if (rows.length !== adminCount) {
    throw new Error(
      `Leitura service_role incompleta: ${rows.length}/${adminCount} produtos. Verifique SUPABASE_SERVICE_ROLE_KEY na Vercel.`
    );
  }
  return { rows, readVia: "service_role", expectedCount: adminCount };
}
