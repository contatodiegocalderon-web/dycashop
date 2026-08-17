import type { NextRequest } from "next/server";

export const STAFF_ROLES = ["owner", "seller", "gestor"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const GESTOR_HOME_PATH = "/admin/historico";

const GESTOR_ALLOWED_ADMIN_PATHS = ["/admin/historico", "/admin/metricas"] as const;

const GESTOR_ALLOWED_API_GET = new Set([
  "/api/admin/metrics",
  "/api/admin/category-costs",
  "/api/admin/staff-seller-filters",
  "/api/admin/orders",
]);

type PrincipalLike =
  | { kind: "api_key" }
  | { kind: "staff"; staff: { role: StaffRole } }
  | null
  | undefined;

export function parseStaffRole(raw: unknown): StaffRole | null {
  if (raw === "owner" || raw === "seller" || raw === "gestor") return raw;
  return null;
}

export function isGestorRole(role: unknown): boolean {
  return role === "gestor";
}

/** Dono, chave API ou gestor: veem todas as vendas e podem filtrar por vendedor. */
export function principalSeesAllSellers(principal: PrincipalLike): boolean {
  if (!principal) return false;
  if (principal.kind === "api_key") return true;
  return principal.staff.role === "owner" || principal.staff.role === "gestor";
}

export function isGestorAdminPathAllowed(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "");
  return GESTOR_ALLOWED_ADMIN_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`)
  );
}

export function gestorForbiddenError(): Error & { status: number } {
  const err = new Error(
    "Acesso do gestor: apenas visualização de histórico e métricas"
  ) as Error & { status: number };
  err.status = 403;
  return err;
}

/** Gestor só GET nas rotas de histórico/métricas; qualquer escrita é bloqueada. */
export function assertGestorApiAccess(
  request: NextRequest,
  principal: Exclude<PrincipalLike, null | undefined>
): void {
  if (principal.kind !== "staff" || principal.staff.role !== "gestor") return;

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw gestorForbiddenError();
  }

  const path = request.nextUrl.pathname;
  if (!GESTOR_ALLOWED_API_GET.has(path)) {
    throw gestorForbiddenError();
  }

  if (path === "/api/admin/orders") {
    const status = request.nextUrl.searchParams.get("status") ?? "";
    if (status !== "PAGO") {
      throw gestorForbiddenError();
    }
  }
}
