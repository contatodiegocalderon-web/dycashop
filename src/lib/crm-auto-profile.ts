import type { BusinessProfile } from "@/lib/client-follow-up";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  buildWhatsappLookup,
  normalizeWhatsappDigits,
  whatsappDedupeKeys,
  whatsappMatchesLookup,
} from "@/lib/whatsapp-normalize";

/** Valor mínimo (inclusive) para perfil revendedor. */
export const CRM_PROFILE_REVENDEDOR_MIN = 250;

/** Valor mínimo (inclusive) para perfil lojista. */
export const CRM_PROFILE_LOJISTA_MIN = 700;

const PROFILE_RANK: Record<BusinessProfile, number> = {
  uso_proprio: 0,
  revendedor: 1,
  lojista: 2,
};

export type PaidOrderAmountRow = {
  customer_whatsapp: string;
  sale_amount: number | null;
};

/** Perfil a partir do maior valor de compra confirmada do cliente. */
export function businessProfileFromMaxSaleAmount(
  maxAmount: number
): BusinessProfile {
  const amount = Number.isFinite(maxAmount) ? maxAmount : 0;
  if (amount >= CRM_PROFILE_LOJISTA_MIN) return "lojista";
  if (amount >= CRM_PROFILE_REVENDEDOR_MIN) return "revendedor";
  return "uso_proprio";
}

export function mergeBusinessProfiles(
  current: BusinessProfile | null | undefined,
  next: BusinessProfile
): BusinessProfile {
  if (!current) return next;
  return PROFILE_RANK[next] > PROFILE_RANK[current] ? next : current;
}

function isBusinessProfileValue(v: unknown): v is BusinessProfile {
  return v === "lojista" || v === "revendedor" || v === "uso_proprio";
}

/** Maior `sale_amount` PAGO para o WhatsApp (dedupe com/sem 55). */
export function maxPaidSaleAmountForWhatsapp(
  paidRows: PaidOrderAmountRow[],
  customerWhatsapp: string,
  floorAmount = 0
): number {
  const lookup = buildWhatsappLookup([{ customer_whatsapp: customerWhatsapp }]);
  let maxAmount = Number.isFinite(floorAmount) ? floorAmount : 0;

  for (const row of paidRows) {
    if (!whatsappMatchesLookup(row.customer_whatsapp, lookup)) continue;
    const n = Number(row.sale_amount ?? 0);
    if (Number.isFinite(n) && n > maxAmount) maxAmount = n;
  }

  return maxAmount;
}

async function fetchPaidOrderAmountRows(
  admin: ReturnType<typeof createAdminClient>
): Promise<PaidOrderAmountRow[]> {
  const { data: paidRows, error: paidErr } = await admin
    .from("orders")
    .select("customer_whatsapp, sale_amount")
    .eq("status", "PAGO")
    .not("customer_whatsapp", "is", null);

  if (paidErr) {
    const missing = /does not exist|schema cache|relation/i.test(paidErr.message);
    if (missing) return [];
    throw new Error(paidErr.message);
  }

  return (paidRows ?? []) as PaidOrderAmountRow[];
}

async function findExistingBusinessProfile(
  admin: ReturnType<typeof createAdminClient>,
  customerWhatsapp: string
): Promise<BusinessProfile | null> {
  const keys = whatsappDedupeKeys(normalizeWhatsappDigits(customerWhatsapp));
  if (!keys.length) return null;

  const { data, error } = await admin
    .from("crm_client_profiles")
    .select("business_profile")
    .in("whatsapp_digits", keys);

  if (error) {
    const missing = /does not exist|schema cache|relation/i.test(error.message);
    if (missing) return null;
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const bp = (row as { business_profile: string | null }).business_profile;
    if (isBusinessProfileValue(bp)) return bp;
  }
  return null;
}

/**
 * Classifica perfil CRM pelo maior `sale_amount` PAGO e grava em `crm_client_profiles`
 * apenas quando o cliente ainda não tem perfil (não altera perfis existentes).
 */
export async function classifyBusinessProfileFromPaidOrders(
  admin: ReturnType<typeof createAdminClient>,
  customerWhatsapp: string,
  options?: { paidRows?: PaidOrderAmountRow[] }
): Promise<BusinessProfile | null> {
  const wa = normalizeWhatsappDigits(customerWhatsapp);
  if (wa.length < 10) return null;

  const existing = await findExistingBusinessProfile(admin, wa);
  if (existing) return existing;

  const paidRows = options?.paidRows ?? (await fetchPaidOrderAmountRows(admin));
  const maxAmount = maxPaidSaleAmountForWhatsapp(paidRows, wa);
  const autoProfile = businessProfileFromMaxSaleAmount(maxAmount);

  const { error: upsertErr } = await admin.from("crm_client_profiles").upsert(
    {
      whatsapp_digits: wa,
      business_profile: autoProfile,
    },
    { onConflict: "whatsapp_digits" }
  );

  if (upsertErr) {
    const missing = /does not exist|schema cache|relation/i.test(upsertErr.message);
    if (missing) return null;
    throw new Error(upsertErr.message);
  }

  return autoProfile;
}

/**
 * Após confirmar pedido, atualiza perfil CRM com base no maior `sale_amount` PAGO.
 */
export async function upsertAutoBusinessProfileOnConfirm(
  admin: ReturnType<typeof createAdminClient>,
  customerWhatsapp: string,
  confirmedSaleAmount: number
): Promise<BusinessProfile | null> {
  const wa = normalizeWhatsappDigits(customerWhatsapp);
  if (wa.length < 10) return null;

  const paidRows = await fetchPaidOrderAmountRows(admin);
  const maxAmount = maxPaidSaleAmountForWhatsapp(
    paidRows,
    wa,
    Number.isFinite(confirmedSaleAmount) ? confirmedSaleAmount : 0
  );

  const autoProfile = businessProfileFromMaxSaleAmount(maxAmount);

  const { data: existing } = await admin
    .from("crm_client_profiles")
    .select("business_profile")
    .eq("whatsapp_digits", wa)
    .maybeSingle();

  const current = (existing?.business_profile as BusinessProfile | null) ?? null;
  const merged = mergeBusinessProfiles(current, autoProfile);

  if (current === merged) return merged;

  const { error: upsertErr } = await admin.from("crm_client_profiles").upsert(
    {
      whatsapp_digits: wa,
      business_profile: merged,
    },
    { onConflict: "whatsapp_digits" }
  );

  if (upsertErr) {
    const missing = /does not exist|schema cache|relation/i.test(upsertErr.message);
    if (missing) return null;
    throw new Error(upsertErr.message);
  }

  return merged;
}
