import type { OrderStockConflict } from "@/lib/order-stock-conflict";
import {
  STOCK_CONFLICT_ADMIN_MESSAGE,
  STOCK_CONFLICT_CLIENT_MESSAGE,
} from "@/lib/order-stock-conflict";

type Props = {
  conflict: OrderStockConflict;
  variant: "client" | "admin";
};

export function StockConflictNotice({ conflict, variant }: Props) {
  const isAdmin = variant === "admin";
  const boxClass = isAdmin
    ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    : "rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-sm text-amber-100";

  return (
    <div className={boxClass}>
      <p className="font-semibold">
        {isAdmin ? STOCK_CONFLICT_ADMIN_MESSAGE : STOCK_CONFLICT_CLIENT_MESSAGE}
      </p>
      {conflict.triggered_by_display_number != null &&
        conflict.triggered_by_display_number > 0 && (
          <p className={`mt-1 ${isAdmin ? "text-amber-900" : "text-amber-200/90"}`}>
            Outro pedido confirmado antes: #
            {conflict.triggered_by_display_number}
          </p>
        )}
      <ul className={`mt-2 list-disc space-y-0.5 pl-5 ${isAdmin ? "text-amber-900" : "text-amber-100/90"}`}>
        {conflict.items.map((it) => (
          <li key={`${it.brand}-${it.color}-${it.size}-${it.quantity}`}>
            {it.brand} {it.color} ({it.size}) — pedido: {it.quantity}, disponível agora:{" "}
            {it.available}
          </li>
        ))}
      </ul>
    </div>
  );
}
