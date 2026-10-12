"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { DROP_COMMUNITY_PATH, DROP_LANDING_PATH } from "@/lib/dropshipping";

async function logout() {
  await fetch("/api/auth/drop/logout", { method: "POST", credentials: "include" });
  window.location.href = DROP_LANDING_PATH;
}

export function CommunityShell({
  children,
  back,
}: {
  children: ReactNode;
  back?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-stone-100">
      <header className="sticky top-0 z-40 bg-gradient-to-b from-black/90 to-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-4">
            {back ? (
              <Link
                href={DROP_COMMUNITY_PATH}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-stone-200 hover:bg-white/10"
                aria-label="Voltar para a comunidade"
              >
                <svg viewBox="0 0 20 20" width={16} height={16} fill="none" aria-hidden>
                  <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ) : null}
            <Link href={DROP_COMMUNITY_PATH} className="flex items-center gap-2.5">
              <Image
                src="/brand-logo.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                unoptimized
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-stone-100">
                DYCASHOP <span className="text-emerald-400">Comunidade</span>
              </span>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400 hover:text-white"
          >
            Sair
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

export function CommunityLoading({ error }: { error?: string | null }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b0b0d] px-6 text-center text-sm text-stone-500">
      {error ?? "Abrindo a comunidade…"}
    </div>
  );
}
