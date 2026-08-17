import type { NextRequest } from "next/server";
import {
  assertOwnerAccess as assertOwnerAccessInner,
  assertPrincipalResolved,
  resolvePrincipal,
  STAFF_COOKIE,
  apiKeyMatches,
  signStaffJwt,
  verifyStaffJwt,
} from "@/lib/access";
import { assertGestorApiAccess } from "@/lib/staff-role";

export { STAFF_COOKIE, resolvePrincipal, apiKeyMatches, signStaffJwt, verifyStaffJwt };

/** Qualquer sessão staff válida ou chave API admin (retrocompatível com scripts). */
export async function assertAdmin(request: NextRequest): Promise<void> {
  const principal = await assertPrincipalResolved(request);
  assertGestorApiAccess(request, principal);
}

/** Sincronização Drive, OAuth Google, custos editáveis — só dono ou chave API. */
export async function assertOwnerAccess(request: NextRequest) {
  return assertOwnerAccessInner(request);
}
