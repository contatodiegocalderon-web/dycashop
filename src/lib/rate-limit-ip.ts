import type { NextRequest } from "next/server";

/**
 * IP do cliente (Vercel / proxies). Não é à prova de spoofing, mas serve para reduzir abuso em massa.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

type Bucket = Map<string, number[]>;

function getBucket(storeKey: string): Bucket {
  const g = globalThis as typeof globalThis & Record<string, Bucket | undefined>;
  const k = `__rateLimit_${storeKey}`;
  if (!g[k]) g[k] = new Map();
  return g[k]!;
}

export type RateLimitOpts = {
  /** Máximo de pedidos/janela por chave */
  max: number;
  /** Janela em ms */
  windowMs: number;
};

/**
 * Sliding window simples (memória por instância serverless).
 * Em deploys multi-instância o limite é aproximado — combinado com headers e caps reduz abuso.
 */
export function rateLimitAllow(key: string, storeKey: string, opts: RateLimitOpts): boolean {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = getBucket(storeKey);
  const arr = (bucket.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= opts.max) {
    bucket.set(key, arr);
    return false;
  }
  arr.push(now);
  bucket.set(key, arr);
  return true;
}
