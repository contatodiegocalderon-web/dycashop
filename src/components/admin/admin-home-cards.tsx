"use client";

import Link from "next/link";
import { useAdminAuth } from "@/contexts/admin-auth";

const cards = [
  {
    href: "/admin/pedidos",
    title: "Pedidos",
    desc: "Confirmar pagamentos, baixar stock e registar vendas.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: false,
  },
  {
    href: "/admin/historico",
    title: "Histórico",
    desc: "Pedidos confirmados e registos de vendas concluídas.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: false,
  },
  {
    href: "/admin/metricas",
    title: "Métricas",
    desc: "Ticket médio, lucro e gráficos por categoria.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: false,
  },
  {
    href: "/admin/categorias",
    title: "Categorias",
    desc: "Custos, tabela de atacado e vídeo por categoria.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: false,
  },
  {
    href: "/admin/clientes",
    title: "Clientes",
    desc: "Lista de leads e compradores, exportação CSV e follow-up.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: false,
  },
  {
    href: "/admin/estoque",
    title: "Controle de estoque",
    desc: "Peças por categoria e tamanho (stock atual do catálogo).",
    accent: "from-emerald-500 via-teal-500 to-cyan-600",
    ownerOnly: true,
  },
  {
    href: "/admin/configuracao",
    title: "Catálogo & Drive",
    desc: "Sincronizar pasta do Google Drive e OAuth.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
    ownerOnly: true,
  },
] as const;

export function AdminHomeCards() {
  const { isOwner } = useAdminAuth();
  const visible = cards.filter((c) => !c.ownerOnly || isOwner);

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-900/5 transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
        >
          <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-200 group-hover:opacity-100">
            <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-violet-500/15 blur-2xl" />
            <div className="absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-fuchsia-500/10 blur-2xl" />
          </div>
          <div
            className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${c.accent}`}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Módulo
          </p>
          <h2 className="mt-1 text-xl font-bold text-stone-950 group-hover:text-violet-800">
            {c.title}
          </h2>
          <p className="mt-3 min-h-[44px] text-sm leading-relaxed text-stone-700">
            {c.desc}
          </p>
          <span className="mt-4 inline-flex items-center text-sm font-semibold text-violet-700 transition group-hover:text-violet-800">
            Acessar →
          </span>
        </Link>
      ))}
    </div>
  );
}
