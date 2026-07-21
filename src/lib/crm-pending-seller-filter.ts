import type { createAdminClient } from "@/lib/supabase/admin";
import type { resolvePrincipal } from "@/lib/access";

const STAFF_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nameFromEmail(email: string): string {
  const base = email.split("@")[0] ?? email;
  const clean = base.replace(/[._-]+/g, " ").trim();
  if (!clean) return email;
  return clean
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function escapeIlikeToken(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function buildPendingRequestedSellerOr(
  staffDisplay: string,
  opts: { includeUnassigned: boolean }
): string | null {
  const d = staffDisplay.trim();
  const first = d ? d.split(/\s+/)[0]!.trim() : "";
  const labels = new Set<string>();
  if (d) labels.add(d);
  if (first) labels.add(first);
  const parts: string[] = [];
  if (opts.includeUnassigned) parts.push("requested_seller_name.is.null");
  for (const lab of Array.from(labels)) {
    const e = escapeIlikeToken(lab);
    if (!e) continue;
    const inner = e.replace(/"/g, '\\"');
    parts.push(`requested_seller_name.ilike."${inner}"`);
    parts.push(`requested_seller_name.ilike."${inner}%"`);
  }
  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(",");
}

/** Mesmo filtro de vendedor da aba Pedidos para PENDENTE_PAGAMENTO. */
export async function applyPendingOrdersSellerScope<Q>(
  admin: ReturnType<typeof createAdminClient>,
  q: Q,
  opts: {
    principal: Awaited<ReturnType<typeof resolvePrincipal>>;
    rawSellerScope: string;
  }
): Promise<Q> {
  const { principal, rawSellerScope } = opts;
  const sellerId =
    principal?.kind === "staff" && principal.staff.role === "seller"
      ? principal.staff.staffId
      : null;
  const isOwnerPrincipal =
    principal?.kind === "api_key" ||
    (principal?.kind === "staff" && principal.staff.role === "owner");

  if (sellerId) return q;

  if (!isOwnerPrincipal || !rawSellerScope || rawSellerScope === "all") {
    return q;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = q as any;

  if (rawSellerScope === "me") {
    const { data: own } = await admin
      .from("staff_users")
      .select("email, full_name")
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    const display =
      String(own?.full_name ?? "").trim() ||
      nameFromEmail(String(own?.email ?? ""));
    const clause = buildPendingRequestedSellerOr(display, {
      includeUnassigned: true,
    });
    if (clause) query = query.or(clause);
  } else if (STAFF_UUID_RE.test(rawSellerScope)) {
    const { data: st } = await admin
      .from("staff_users")
      .select("email, full_name")
      .eq("id", rawSellerScope)
      .maybeSingle();
    const display =
      String(st?.full_name ?? "").trim() ||
      nameFromEmail(String(st?.email ?? ""));
    const clause = buildPendingRequestedSellerOr(display, {
      includeUnassigned: false,
    });
    if (clause) query = query.or(clause);
  }

  return query as Q;
}
