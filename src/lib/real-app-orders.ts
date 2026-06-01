import type { ConfirmedAtFilter } from "@/lib/admin-period";
import { applyConfirmedAtFilterToOrdersQuery } from "@/lib/admin-orders-query";

/** Texto padrão para UI de métricas / histórico. */
export const REAL_APP_ORDERS_HELP =
  "Só pedidos confirmados no app. Importações da planilha (aba Clientes) não entram aqui.";

type FilterableQuery = {
  eq(column: string, value: unknown): FilterableQuery;
  not(column: string, operator: string, value: unknown): FilterableQuery;
  gt(column: string, value: number): FilterableQuery;
  gte(column: string, value: string): FilterableQuery;
  lt(column: string, value: string): FilterableQuery;
};

/**
 * Vendas reais: confirmadas no admin com valor e itens do catálogo.
 * Exclui `legacy_import` (leads/pedidos sintéticos da planilha CRM).
 */
export function applyRealAppConfirmedOrdersFilter<Q extends FilterableQuery>(
  query: Q
): Q {
  return query
    .eq("status", "PAGO")
    .not("sale_amount", "is", null)
    .gt("sale_amount", 0)
    .not("confirmed_at", "is", null)
    .eq("legacy_import", false);
}

export function applyRealAppConfirmedOrdersWithPeriod<
  Q extends FilterableQuery,
>(query: Q, dateFilter: ConfirmedAtFilter): Q {
  return applyConfirmedAtFilterToOrdersQuery(
    applyRealAppConfirmedOrdersFilter(query),
    dateFilter
  );
}
