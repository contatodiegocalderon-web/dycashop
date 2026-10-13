"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DROP_COMMUNITY_PATH, DROP_LANDING_PATH, DROP_LOGIN_PATH } from "@/lib/dropshipping";
import { DropAuthShell, dropFieldClass } from "@/components/drop-login";

async function postClaim(body: Record<string, string>): Promise<{ fullName?: string | null }> {
  const res = await fetch("/api/drop/claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string; fullName?: string | null };
  if (!res.ok) throw new Error(data.error ?? "Falha ao criar acesso");
  return data;
}

export function DropClaim() {
  const [verified, setVerified] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await postClaim({ step: "verify", email: email.trim().toLowerCase(), phone });
      if (data.fullName && !fullName) setFullName(data.fullName);
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("As senhas não são iguais.");
      return;
    }
    setBusy(true);
    try {
      await postClaim({ fullName, email: email.trim().toLowerCase(), phone, password });
      window.location.href = DROP_COMMUNITY_PATH;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropAuthShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">
        {verified ? "Assinatura confirmada" : "Exclusivo para assinantes"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50">
        {verified ? "Agora crie sua senha" : "Crie seu acesso à comunidade"}
      </h1>
      <p className="mt-2 text-sm text-stone-400">
        {verified ? (
          <>
            Tudo certo com a sua compra. Escolha a senha que você vai usar para entrar.
          </>
        ) : (
          <>
            Primeiro vamos confirmar sua assinatura. Use o{" "}
            <strong className="text-stone-200">mesmo email e celular</strong> que você informou na
            compra da Kiwify.
          </>
        )}
      </p>

      {verified ? (
        <form onSubmit={create} className="mt-8 space-y-3">
          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-200">
            ✓ {email.trim().toLowerCase()}
          </p>
          <input
            placeholder="Seu nome"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={dropFieldClass}
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Crie uma senha (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={dropFieldClass}
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={dropFieldClass}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold uppercase tracking-[0.12em] text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Criando…" : "Criar acesso e entrar"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-8 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email da compra"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={dropFieldClass}
          />
          <input
            required
            type="tel"
            autoComplete="tel"
            placeholder="Celular da compra (com DDD)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={dropFieldClass}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold uppercase tracking-[0.12em] text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Conferindo…" : "Confirmar minha assinatura"}
          </button>
          <p className="pt-2 text-center text-xs text-stone-500">
            Ainda não assinou?{" "}
            <Link href={DROP_LANDING_PATH} className="text-stone-300 underline">
              Conheça o plano
            </Link>
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-stone-500">
        Já criou?{" "}
        <Link href={DROP_LOGIN_PATH} className="text-stone-200 underline">
          Entrar
        </Link>
      </p>
    </DropAuthShell>
  );
}
