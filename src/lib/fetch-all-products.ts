import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/**
 * Lista todos os produtos com paginação estável (ordenar só por colunas não-únicas
 * faz saltar/duplicar linhas entre páginas no PostgREST).
 */
export async function fetchAllProductsPaginated<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  columns: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("products")
      .select(columns)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as unknown as T[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
