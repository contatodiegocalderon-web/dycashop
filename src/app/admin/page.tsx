import Link from "next/link";
import { CatalogPublicLink } from "@/components/admin/catalog-public-link";

const cards = [
  {
    href: "/admin/pedidos",
    title: "Pedidos",
    desc: "Confirmar pagamentos, baixar stock e registar vendas.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
  {
    href: "/admin/historico",
    title: "Histórico",
    desc: "Pedidos confirmados e registos de vendas concluídas.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
  {
    href: "/admin/metricas",
    title: "Métricas",
    desc: "Ticket médio, lucro e gráficos por categoria.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
  {
    href: "/admin/categorias",
    title: "Categorias",
    desc: "Custos, tabela de atacado e vídeo por categoria.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
  {
    href: "/admin/clientes",
    title: "Clientes",
    desc: "Lista de leads e compradores, exportação CSV e follow-up.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
  {
    href: "/admin/configuracao",
    title: "Catálogo & Drive",
    desc: "Sincronizar pasta do Google Drive e OAuth.",
    accent: "from-violet-500 via-fuchsia-500 to-purple-600",
  },
];

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          Painel administrativo
        </h1>
        <p className="mt-2 text-sm text-stone-700">
          Área da equipa para operação de vendas, clientes e catálogo.
        </p>
      </div>

      <div className="mb-7">
        <CatalogPublicLink />
      </div>

      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Módulos operacionais
          </h2>
          <p className="mt-1 text-sm text-stone-700">
            Acesso rápido com visual profissional e contraste alto.
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
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
            <p className="mt-3 min-h-[44px] text-sm leading-relaxed text-stone-700">{c.desc}</p>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-violet-700 transition group-hover:text-violet-800">
              Acessar →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
