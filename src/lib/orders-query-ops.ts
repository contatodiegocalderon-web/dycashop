/**
 * Subconjunto do builder Supabase para filtros em helpers.
 * Evita "Type instantiation is excessively deep" do PostgrestFilterBuilder.
 */
export type OrdersQueryOps = {
  eq(column: string, value: unknown): OrdersQueryOps;
  not(column: string, operator: string, value: unknown): OrdersQueryOps;
  gt(column: string, value: number): OrdersQueryOps;
  gte(column: string, value: string): OrdersQueryOps;
  lt(column: string, value: string): OrdersQueryOps;
  or(filter: string): OrdersQueryOps;
};

/** Aplica filtros e devolve o mesmo builder (cast) para encadear `.order()` / `.limit()`. */
export function castOrdersQueryAfterFilters<Q>(q: Q, filtered: OrdersQueryOps): Q {
  return filtered as unknown as Q;
}
