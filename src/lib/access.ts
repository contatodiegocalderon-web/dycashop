import type { NextRequest } from "next/server";
import * as jose from "jose";

export const STAFF_COOKIE = "staff_session";

export type StaffPrincipal = {
  staffId: string;
  email: string;
  role: "owner" | "seller";
};

export type AuthPrincipal =
  | { kind: "api_key"; isOwner: true }
  | { kind: "staff"; staff: StaffPrincipal };

function normalizeSecret(): Uint8Array {
  const s =
    process.env.STAFF_JWT_SECRET?.trim() ||
    process.env.ADMIN_API_SECRET?.trim() ||
    "";
  if (!s) {
    throw new Error("Configure STAFF_JWT_SECRET (ou ADMIN_API_SECRET para desenvolvimento)");
  }
  return new TextEncoder().encode(s);
}

export async function verifyStaffJwt(token: string): Promise<StaffPrincipal | null> {
  try {
    const { payload } = await jose.jwtVerify(token, normalizeSecret(), {
      algorithms: ["HS256"],
      issuer: "streetwear-catalog",
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = payload.role === "seller" || payload.role === "owner" ? payload.role : null;
    if (!sub || !email || !role) return null;
    return { staffId: sub, email, role };
  } catch {
    return null;
  }
}

export async function signStaffJwt(staff: StaffPrincipal): Promise<string> {
  return new jose.SignJWT({
    email: staff.email,
    role: staff.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(staff.staffId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("streetwear-catalog")
    .sign(normalizeSecret());
}

export function apiKeyMatches(request: NextRequest): boolean {
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-admin-key")?.trim() ?? "";
  return header === secret;
}

export async function resolvePrincipal(
  request: NextRequest
): Promise<AuthPrincipal | null> {
  if (apiKeyMatches(request)) {
    return { kind: "api_key", isOwner: true };
  }
  const raw = request.cookies.get(STAFF_COOKIE)?.value;
  if (!raw) return null;
  const staff = await verifyStaffJwt(raw);
  if (!staff) return null;
  return { kind: "staff", staff };
}

export async function assertPrincipalResolved(
  request: NextRequest
): Promise<AuthPrincipal> {
  const p = await resolvePrincipal(request);
  if (!p) {
    const err = new Error("Não autorizado");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return p;
}

/** Rotas só para dono ou chave API (sync Drive, custos editáveis, OAuth Google). */
export async function assertOwnerAccess(request: NextRequest): Promise<AuthPrincipal> {
  const p = await assertPrincipalResolved(request);
  if (p.kind === "staff" && p.staff.role !== "owner") {
    const err = new Error("Acesso reservado ao administrador");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return p;
}
