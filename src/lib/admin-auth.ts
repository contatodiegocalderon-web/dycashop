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

export { STAFF_COOKIE, resolvePrincipal, apiKeyMatches, signStaffJwt, verifyStaffJwt };

/** Qualquer sessão staff válida ou chave API admin (retrocompatível com scripts). */
export async function assertAdmin(request: NextRequest): Promise<void> {
  await assertPrincipalResolved(request);
}

/** Sincronização Drive, OAuth Google, custos editáveis — só dono ou chave API. */
export async function assertOwnerAccess(request: NextRequest) {
  return assertOwnerAccessInner(request);
}
