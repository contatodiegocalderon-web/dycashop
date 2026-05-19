/** Metadados no pedido para reconfirmar só as peças que falharam no Drive. */

export type DriveRetryPayload = {
  skip_ids: string[];
  failed_ids: string[];
  at: string;
};

export type ConfirmLockPayload = {
  at: string;
  by?: string;
  reason?: string;
  drive_ok?: string[];
  drive_errors?: { productId: string; message: string }[];
};

export function isConfirmLockPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return "_confirm_lock" in o;
}

export function parseConfirmLock(raw: unknown): ConfirmLockPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lock = o._confirm_lock;
  if (!lock || typeof lock !== "object") return null;
  const l = lock as Record<string, unknown>;
  return {
    at: String(l.at ?? ""),
    by: l.by != null ? String(l.by) : undefined,
    reason: l.reason != null ? String(l.reason) : undefined,
    drive_ok: Array.isArray(l.drive_ok)
      ? (l.drive_ok as unknown[]).map((id) => String(id))
      : undefined,
    drive_errors: Array.isArray(l.drive_errors)
      ? (l.drive_errors as { productId?: string; message?: string }[]).map(
          (e) => ({
            productId: String(e.productId ?? ""),
            message: String(e.message ?? ""),
          })
        )
      : undefined,
  };
}

export function isDriveRetryOnlyPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (!("_drive_retry" in o)) return false;
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === "_drive_retry";
}

export function parseDriveRetry(raw: unknown): DriveRetryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const retry = o._drive_retry;
  if (!retry || typeof retry !== "object") return null;
  const r = retry as Record<string, unknown>;
  return {
    skip_ids: Array.isArray(r.skip_ids)
      ? (r.skip_ids as unknown[]).map((id) => String(id))
      : [],
    failed_ids: Array.isArray(r.failed_ids)
      ? (r.failed_ids as unknown[]).map((id) => String(id))
      : [],
    at: String(r.at ?? ""),
  };
}

/** Pedido pendente pode iniciar confirmação (sem lock activo). */
export function canStartOrderConfirm(saleAmountByCategory: unknown): boolean {
  if (saleAmountByCategory == null) return true;
  return isDriveRetryOnlyPayload(saleAmountByCategory);
}

export function driveProductIdsForConfirm(
  allProductIds: string[],
  retry: DriveRetryPayload | null
): string[] {
  if (!retry) return allProductIds;
  const skip = new Set(retry.skip_ids);
  if (retry.failed_ids.length > 0) {
    const failed = new Set(retry.failed_ids);
    return allProductIds.filter((id) => failed.has(id));
  }
  return allProductIds.filter((id) => !skip.has(id));
}
