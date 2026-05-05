"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_KEY_STORAGE,
  useAdminAuth,
} from "@/contexts/admin-auth";

export default function AdminLoginPage() {
  const { session, refreshSession } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyKey, setLegacyKey] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      setLegacyKey(sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (session) {
      router.replace("/admin");
    }
  }, [session, router]);

  const loginWithLegacyKey = useCallback(async () => {
    setError(null);
    const trimmed = legacyKey.trim();
    try {
      if (trimmed) {
        sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
      } else {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      }
    } catch {
      /* ignore */
    }
    await refreshSession();
    const r = await fetch("/api/auth/staff/me", {
      credentials: "include",
      headers: trimmed ? { "x-admin-key": trimmed } : {},
    });
    if (r.ok) {
      const j = (await r.json()) as { user?: unknown };
      if (j.user) {
        router.replace("/admin");
        return;
      }
    }
    setError("Chave inválida ou sessão não criada.");
  }, [legacyKey, refreshSession, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/staff/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao entrar");
      }
      await refreshSession();
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-center text-2xl font-bold text-stone-900">
          Área administrativa
        </h1>
        <p className="mt-2 text-center text-sm text-stone-600">
          Entre com o email e senha da equipa. O primeiro acesso requer criar contas via{" "}
          <code className="rounded bg-stone-100 px-1 text-[11px]">POST /api/auth/staff/bootstrap</code>{" "}
          com a chave <code className="rounded bg-stone-100 px-1 text-[11px]">ADMIN_API_SECRET</code>.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Email
            </label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 shadow-inner outline-none ring-emerald-500/30 focus:ring-2"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Senha
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 shadow-inner outline-none ring-emerald-500/30 focus:ring-2"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "A entrar…" : "Entrar"}
          </button>
        </form>

        <div className="mt-8 border-t border-stone-200 pt-6">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="text-xs font-medium text-stone-500 underline"
          >
            {showLegacy ? "Ocultar" : "Usar"} chave API antiga (ADMIN_API_SECRET)
          </button>
          {showLegacy && (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={legacyKey}
                onChange={(e) => setLegacyKey(e.target.value)}
                placeholder="Colar chave…"
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900"
              />
              <button
                type="button"
                onClick={() => void loginWithLegacyKey()}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100"
              >
                Entrar com chave
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          <Link href="/" className="font-medium text-emerald-700 underline hover:text-emerald-800">
            Voltar à loja
          </Link>
        </p>
      </div>
    </div>
  );
}
