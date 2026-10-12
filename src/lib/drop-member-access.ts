import type { NextRequest } from "next/server";
import * as jose from "jose";

export const DROP_MEMBER_COOKIE = "drop_member_session";

export type DropMemberPrincipal = {
  memberId: string;
  email: string;
  fullName: string | null;
};

function normalizeSecret(): Uint8Array {
  const s =
    process.env.STAFF_JWT_SECRET?.trim() ||
    process.env.ADMIN_API_SECRET?.trim() ||
    "";
  if (!s) {
    throw new Error(
      "Configure STAFF_JWT_SECRET (ou ADMIN_API_SECRET para desenvolvimento)"
    );
  }
  return new TextEncoder().encode(s);
}

export async function verifyDropMemberJwt(
  token: string
): Promise<DropMemberPrincipal | null> {
  try {
    const { payload } = await jose.jwtVerify(token, normalizeSecret(), {
      algorithms: ["HS256"],
      issuer: "streetwear-catalog-drop",
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const fullName =
      typeof payload.fullName === "string" && payload.fullName.trim()
        ? payload.fullName.trim()
        : null;
    if (!sub || !email) return null;
    return { memberId: sub, email, fullName };
  } catch {
    return null;
  }
}

export async function signDropMemberJwt(
  member: DropMemberPrincipal
): Promise<string> {
  return new jose.SignJWT({
    email: member.email,
    fullName: member.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(member.memberId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .setIssuer("streetwear-catalog-drop")
    .sign(normalizeSecret());
}

export async function resolveDropMember(
  request: NextRequest
): Promise<DropMemberPrincipal | null> {
  const raw = request.cookies.get(DROP_MEMBER_COOKIE)?.value;
  if (!raw) return null;
  return verifyDropMemberJwt(raw);
}

/** Sessão válida + membro ainda ativo no banco (bloqueio de cancelamento vale na hora). */
export async function resolveActiveDropMember(
  request: NextRequest
): Promise<DropMemberPrincipal | null> {
  const member = await resolveDropMember(request);
  if (!member) return resolveOwnerAsDropMember(request);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient()
    .from("drop_members")
    .select("active")
    .eq("id", member.memberId)
    .maybeSingle();
  return data?.active ? member : resolveOwnerAsDropMember(request);
}

/** Dono logado no admin entra na comunidade com um membro próprio (progresso/checks precisam de member_id). */
async function resolveOwnerAsDropMember(
  request: NextRequest
): Promise<DropMemberPrincipal | null> {
  const { resolvePrincipal } = await import("@/lib/access");
  const principal = await resolvePrincipal(request);
  if (principal?.kind !== "staff" || principal.staff.role !== "owner") return null;

  const email = principal.staff.email.trim().toLowerCase();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("drop_members")
    .select("id, full_name")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (existing) {
    return { memberId: existing.id as string, email, fullName: existing.full_name ?? null };
  }

  const bcrypt = await import("bcryptjs");
  const { data: created, error } = await admin
    .from("drop_members")
    .insert({
      email,
      password_hash: await bcrypt.hash(generateDropPassword(32), 10),
      full_name: "DYCASHOP",
      source: "owner",
    })
    .select("id, full_name")
    .single();
  if (error || !created) return null;
  return { memberId: created.id as string, email, fullName: created.full_name ?? null };
}

export function generateDropPassword(length = 10): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i]! % chars.length];
  }
  return out;
}
