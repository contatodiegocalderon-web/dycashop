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

function dedupeById<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String((row as { id?: unknown }).id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
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
 * Lista todos os produtos com paginação estável por `id` (offset + order).
 * Keyset pode divergir do count sob inserts concorrentes na sync Drive.
 */
export async function fetchAllProductsPaginated<T extends Record<string, unknown>>(
  client: SupabaseClient,
  columns: string
): Promise<T[]> {
  const selectCols = ensureIdColumn(columns);
  const all: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await client
      .from("products")
      .select(selectCols)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as unknown as T[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return dedupeById(all);
}

export type InventoryProductsRead = {
  rows: Array<Record<string, unknown>>;
  readVia: "service_role" | "anon_fallback";
  expectedCount: number;
  /** Aviso não-bloqueante (ex.: count vs linhas em corrida na sync). */
  warning?: string | null;
};

/**
 * Lê o catálogo completo para inventário.
 * Prefere service role; se anon enxergar mais linhas, usa anon (mesmo caminho da loja).
 * Não falha se count e listagem divergirem por corrida — devolve as linhas únicas.
 */
export async function fetchAllProductsForInventory<T extends Record<string, unknown>>(
  columns: string
): Promise<{
  rows: T[];
  readVia: "service_role" | "anon_fallback";
  expectedCount: number;
  warning?: string | null;
}> {
  const admin = createAdminClient();
  const anon = createCatalogAnonClient();

  const [adminCount, anonCount] = await Promise.all([
    getProductsTableCount(admin),
    getProductsTableCount(anon),
  ]);

  const preferAnon = anonCount > adminCount;
  const primary = preferAnon ? anon : admin;
  const primaryVia: "service_role" | "anon_fallback" = preferAnon
    ? "anon_fallback"
    : "service_role";
  const expectedHint = Math.max(adminCount, anonCount);

  let rows = await fetchAllProductsPaginated<T>(primary, columns);
  let readVia = primaryVia;

  if (rows.length < expectedHint) {
    const secondary = preferAnon ? admin : anon;
    const secondaryVia: "service_role" | "anon_fallback" = preferAnon
      ? "service_role"
      : "anon_fallback";
    const other = await fetchAllProductsPaginated<T>(secondary, columns);
    if (other.length > rows.length) {
      rows = other;
      readVia = secondaryVia;
    }
  }

  const expectedCount = Math.max(expectedHint, rows.length);
  let warning: string | null = null;

  if (rows.length === 0 && expectedHint > 0) {
    throw new Error(
      "Nenhum produto lido do catálogo. Verifique SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel."
    );
  }

  if (preferAnon) {
    warning =
      "Service role vê menos produtos que o catálogo público — confira SUPABASE_SERVICE_ROLE_KEY na Vercel. Estoque calculado via anon.";
  } else if (adminCount !== anonCount) {
    warning = `Contagens admin/anon divergem (${adminCount}/${anonCount}). Usando ${rows.length} produto(s).`;
  }

  return { rows, readVia, expectedCount, warning };
}
