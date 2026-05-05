import Link from "next/link";
import { CatalogPublicLink } from "@/components/admin/catalog-public-link";

const cards = [
  {
    href: "/admin/pedidos",
    title: "Pedidos",
    desc: "Confirmar pagamentos, baixar stock e registar vendas.",
    accent: "from-emerald-600 to-teal-700",
  },
  {
    href: "/admin/metricas",
    title: "Métricas",
    desc: "Ticket médio, lucro e gráficos por categoria.",
    accent: "from-violet-600 to-indigo-700",
  },
  {
    href: "/admin/categorias",
    title: "Categorias",
    desc: "Custos, tabela de atacado e vídeo por categoria.",
    accent: "from-fuchsia-600 to-purple-700",
  },
  {
    href: "/admin/clientes",
    title: "Clientes",
    desc: "Lista de leads e compradores, exportação CSV e follow-up.",
    accent: "from-sky-600 to-blue-800",
  },
  {
    href: "/admin/configuracao",
    title: "Catálogo & Drive",
    desc: "Sincronizar pasta do Google Drive e OAuth.",
    accent: "from-amber-600 to-orange-700",
  },
];

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-10">
        <CatalogPublicLink />
      </div>
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
          Bem-vindo
        </h1>
        <p className="mt-2 text-stone-600">
          Escolha uma área ou use o menu acima. O catálogo público não mostra este painel — guarde o
          link <span className="font-mono text-xs text-stone-500">/admin/login</span> só para a equipa.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lg shadow-stone-900/5 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div
              className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${c.accent}`}
            />
            <h2 className="text-xl font-bold text-stone-900 group-hover:text-emerald-800">
              {c.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{c.desc}</p>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-700">
              Abrir →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
