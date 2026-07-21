import type { ConfirmedAtFilter } from "@/lib/admin-period";
import { applyConfirmedAtFilterToOrdersQuery } from "@/lib/admin-orders-query";
import {
  castOrdersQueryAfterFilters,
  type OrdersQueryOps,
} from "@/lib/orders-query-ops";

/** Texto padrão para UI de métricas / histórico. */
export const REAL_APP_ORDERS_HELP =
  "Só pedidos confirmados no app. Importações da planilha (aba Clientes) não entram aqui.";

function realAppConfirmedOnOps(query: OrdersQueryOps): OrdersQueryOps {
  return query
    .eq("status", "PAGO")
    .not("sale_amount", "is", null)
    .gt("sale_amount", 0)
    .not("confirmed_at", "is", null)
    .eq("legacy_import", false);
}

export function applyRealAppConfirmedOrdersFilter<Q>(query: Q): Q {
  const ops = query as unknown as OrdersQueryOps;
  return castOrdersQueryAfterFilters(query, realAppConfirmedOnOps(ops));
}

export function applyRealAppConfirmedOrdersWithPeriod<Q>(
  query: Q,
  dateFilter: ConfirmedAtFilter
): Q {
  const ops = applyConfirmedAtFilterToOrdersQuery(
    realAppConfirmedOnOps(query as unknown as OrdersQueryOps),
    dateFilter
  );
  return castOrdersQueryAfterFilters(query, ops);
}
