/** Pedidos visíveis para um vendedor: os seus + pool partilhado «?» (importados / sem vendedor). */
export function sellerPaidOrdersOrFilter(sellerStaffId: string): string {
  const sid = sellerStaffId.trim();
  return [
    `confirmed_by_staff_id.eq.${sid}`,
    "and(confirmed_by_staff_id.is.null,or(requested_seller_name.eq.?,legacy_import.eq.true))",
  ].join(",");
}

/**
 * Aplica filtro de vendedor numa query de pedidos PAGO (PostgREST).
 */
export function applyCrmSellerOrderScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  opts: {
    sellerId: string | null;
    isOwnerPrincipal: boolean;
    rawSellerScope: string;
    ownerStaffId: string | null;
  }
): typeof q {
  const { sellerId, isOwnerPrincipal, rawSellerScope, ownerStaffId } = opts;

  if (sellerId) {
    return q.or(sellerPaidOrdersOrFilter(sellerId));
  }

  if (isOwnerPrincipal && rawSellerScope && rawSellerScope !== "all") {
    if (rawSellerScope === "me") {
      if (ownerStaffId) {
        return q.or(
          `confirmed_by_staff_id.eq.${ownerStaffId},confirmed_by_staff_id.is.null`
        );
      }
    } else if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawSellerScope
      )
    ) {
      return q.eq("confirmed_by_staff_id", rawSellerScope);
    }
  }

  return q;
}
