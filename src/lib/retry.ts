function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Erros de rede, pool Supabase ou limites temporários do Google. */
export function isTransientSyncError(e: unknown): boolean {
  const m = errorText(e).toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("socket hang up") ||
    m.includes("too many connections") ||
    m.includes("connection terminated") ||
    m.includes("rate limit") ||
    m.includes("quota") ||
    m.includes("503") ||
    m.includes("429") ||
    m.includes("backend error")
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    baseDelayMs?: number;
    label?: string;
  }
): Promise<T> {
  const attempts = opts?.attempts ?? 4;
  const baseDelayMs = opts?.baseDelayMs ?? 600;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = isTransientSyncError(e);
      if (!retryable || i === attempts - 1) {
        throw e;
      }
      const wait = baseDelayMs * Math.pow(2, i);
      if (opts?.label) {
        console.warn(
          `[retry] ${opts.label} tentativa ${i + 2}/${attempts} em ${wait}ms: ${errorText(e)}`
        );
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}
