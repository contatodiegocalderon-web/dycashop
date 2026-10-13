"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DROP_COMMUNITY_PATH, DROP_LANDING_PATH } from "@/lib/dropshipping";

export const dropFieldClass =
  "w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-white/25";

export function DropAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#09090b] text-stone-100">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href={DROP_LANDING_PATH} className="flex items-center gap-2.5">
            <Image
              src="/brand-logo.png"
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 object-contain"
              unoptimized
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-200">
              DYCASHOP
            </span>
          </Link>
          <Link
            href={DROP_LANDING_PATH}
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 hover:text-stone-300"
          >
            Voltar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-12">{children}</main>
    </div>
  );
}

export function DropLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await fetch("/api/auth/drop/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao entrar");
      window.location.href = DROP_COMMUNITY_PATH;
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <DropAuthShell>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">
        Comunidade
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-50">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-stone-400">
        Use o email e a senha que você criou no seu primeiro acesso.
      </p>

      <form onSubmit={submitLogin} className="mt-8 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={dropFieldClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={dropFieldClass}
        />
        {loginError ? <p className="text-sm text-red-400">{loginError}</p> : null}
        <button
          type="submit"
          disabled={loginBusy}
          className="w-full rounded-xl bg-stone-100 py-3 text-sm font-bold uppercase tracking-[0.14em] text-zinc-950 hover:bg-white disabled:opacity-60"
        >
          {loginBusy ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <div className="mt-10 border-t border-white/[0.08] pt-8">
        <h2 className="text-sm font-semibold text-stone-200">Acabei de assinar</h2>
        <p className="mt-1 text-sm text-stone-500">
          Logo depois do pagamento a Kiwify te leva para a página de criar seu acesso.
          Não conseguiu? Fale com a equipe DYCASHOP que a gente libera pra você.
        </p>
        <Link
          href={DROP_LANDING_PATH}
          className="mt-4 inline-block text-sm text-stone-300 underline"
        >
          Ainda não assinei
        </Link>
      </div>
    </DropAuthShell>
  );
}
