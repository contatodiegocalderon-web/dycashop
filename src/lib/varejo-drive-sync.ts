/**
 * Metadados de sync Drive em pedidos varejo (MP), guardados em sale_amount_by_category.
 */

export type VarejoDriveSyncError = {
  productId: string;
  message: string;
};

export type VarejoDriveSyncPayload = {
  status: "failed" | "ok";
  at: string;
  product_ids: string[];
  errors?: VarejoDriveSyncError[];
};

const KEY = "_varejo_drive_sync";
const STOCK_APPLIED_KEY = "_varejo_stock_applied_at";

export function asMetaRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

export function parseVarejoDriveSync(
  raw: unknown
): VarejoDriveSyncPayload | null {
  const meta = asMetaRecord(raw);
  const sync = meta[KEY];
  if (!sync || typeof sync !== "object" || Array.isArray(sync)) return null;
  const o = sync as Record<string, unknown>;
  if (o.status !== "failed" && o.status !== "ok") return null;
  const productIds = Array.isArray(o.product_ids)
    ? o.product_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  const errors = Array.isArray(o.errors)
    ? o.errors
        .map((e) => {
          if (!e || typeof e !== "object") return null;
          const row = e as Record<string, unknown>;
          const productId = String(row.productId ?? "").trim();
          const message = String(row.message ?? "").trim();
          if (!productId || !message) return null;
          return { productId, message };
        })
        .filter((e): e is VarejoDriveSyncError => e != null)
    : undefined;
  return {
    status: o.status,
    at: typeof o.at === "string" ? o.at : "",
    product_ids: productIds,
    errors,
  };
}

export function isVarejoDrivePending(raw: unknown): boolean {
  const sync = parseVarejoDriveSync(raw);
  return sync?.status === "failed";
}

export function hasVarejoStockApplied(raw: unknown): boolean {
  const meta = asMetaRecord(raw);
  return typeof meta[STOCK_APPLIED_KEY] === "string";
}

export function withVarejoStockApplied(
  raw: unknown,
  at = new Date().toISOString()
): Record<string, unknown> {
  return { ...asMetaRecord(raw), [STOCK_APPLIED_KEY]: at };
}

export function withVarejoDriveSync(
  raw: unknown,
  sync: VarejoDriveSyncPayload
): Record<string, unknown> {
  return { ...asMetaRecord(raw), [KEY]: sync };
}

export function clearVarejoDriveSyncFailed(
  raw: unknown
): Record<string, unknown> {
  const meta = asMetaRecord(raw);
  const next = { ...meta };
  next[KEY] = {
    status: "ok",
    at: new Date().toISOString(),
    product_ids: Array.isArray((meta[KEY] as { product_ids?: unknown })?.product_ids)
      ? (meta[KEY] as { product_ids: string[] }).product_ids
      : [],
  };
  return next;
}

export function varejoDriveFailureSummary(
  sync: VarejoDriveSyncPayload | null
): string | null {
  if (!sync || sync.status !== "failed") return null;
  const details = (sync.errors ?? [])
    .filter((e) => e.productId !== "_rollback")
    .map((e) => e.message)
    .slice(0, 3);
  if (details.length === 0) {
    return "Falha ao atualizar o Google Drive. Confirme para tentar de novo.";
  }
  return `Falha no Drive: ${details.join(" · ")}`;
}
