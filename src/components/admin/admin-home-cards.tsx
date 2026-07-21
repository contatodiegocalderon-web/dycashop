"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";

type HomePreviews = {
  pedidos: { pendingCount: number };
  historico: {
    displayNumber: number | null;
    saleAmount: number;
    confirmedAt: string | null;
    customerLabel: string | null;
  } | null;
  metricas: { revenueSparkline: number[] };
  estoque: {
    totalPieces: number;
    bars: { label: string; pieces: number }[];
  } | null;
};

type CardDef = {
  href: string;
  title: string;
  ownerOnly: boolean;
  preview: "pedidos" | "historico" | "metricas" | "estoque" | null;
};

const cards: CardDef[] = [
  { href: "/admin/pedidos", title: "Pedidos", ownerOnly: false, preview: "pedidos" },
  { href: "/admin/varejo", title: "Varejo", ownerOnly: false, preview: null },
  { href: "/admin/historico", title: "Histórico", ownerOnly: false, preview: "historico" },
  { href: "/admin/metricas", title: "Métricas", ownerOnly: false, preview: "metricas" },
  { href: "/admin/categorias", title: "Categorias", ownerOnly: false, preview: null },
  { href: "/admin/clientes", title: "Clientes", ownerOnly: false, preview: null },
  {
    href: "/admin/estoque",
    title: "Controle de estoque",
    ownerOnly: true,
    preview: "estoque",
  },
  {
    href: "/admin/configuracao",
    title: "Catálogo & Drive",
    ownerOnly: true,
    preview: null,
  },
];

function fmtMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtShortDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MiniSparkline({ values }: { values: number[] }) {
  const gradId = useId().replace(/:/g, "");
  const data = values.length > 0 ? values : [0];
  const max = Math.max(...data, 1);
  const w = 120;
  const h = 44;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = data.length > 1 ? i * step : w / 2;
      const y = h - 4 - ((v / max) * (h - 8));
      return `${x},${y}`;
    })
    .join(" ");
  const area = `${points} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full text-fuchsia-200/50"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(232 121 249)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${area}`} fill={`url(#${gradId})`} />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function MiniBars({ bars }: { bars: { label: string; pieces: number }[] }) {
  const max = Math.max(...bars.map((b) => b.pieces), 1);
  return (
    <div className="flex h-12 items-end gap-1.5" aria-hidden>
      {bars.map((b) => (
        <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t-sm bg-gradient-to-t from-violet-400/25 to-fuchsia-300/45"
            style={{ height: `${Math.max(8, (b.pieces / max) * 40)}px` }}
            title={`${b.label}: ${b.pieces}`}
          />
        </div>
      ))}
    </div>
  );
}

function CardPreview({
  kind,
  previews,
  pendingFallback,
}: {
  kind: CardDef["preview"];
  previews: HomePreviews | null;
  pendingFallback: number | null;
}) {
  if (!kind || !previews) return null;

  if (kind === "pedidos") {
    const n =
      previews.pedidos.pendingCount ??
      pendingFallback ??
      0;
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end overflow-hidden pr-2 pt-2" aria-hidden>
        <p className="translate-x-2 select-none text-[5.5rem] font-bold leading-none tracking-tighter text-white/[0.07]">
          {n}
        </p>
        <p className="absolute bottom-3 right-4 text-right text-[11px] font-medium uppercase tracking-wider text-violet-300/40">
          {n === 1 ? "pendente" : "pendentes"}
        </p>
      </div>
    );
  }

  if (kind === "historico") {
    const last = previews.historico;
    if (!last) {
      return (
        <p className="pointer-events-none absolute bottom-3 left-4 right-4 text-xs text-violet-300/35" aria-hidden>
          Sem vendas registadas
        </p>
      );
    }
    return (
      <div
        className="pointer-events-none absolute bottom-2 left-3 right-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 backdrop-blur-sm"
        aria-hidden
      >
        <p className="text-[10px] font-medium uppercase tracking-wider text-violet-300/50">
          Última venda
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-violet-100/40">
          {last.displayNumber != null ? `#${last.displayNumber}` : "Pedido"} ·{" "}
          {fmtMoney(last.saleAmount)}
        </p>
        <p className="truncate text-[11px] text-violet-200/30">
          {fmtShortDate(last.confirmedAt)}
          {last.customerLabel ? ` · ${last.customerLabel}` : ""}
        </p>
      </div>
    );
  }

  if (kind === "metricas") {
    const vals = previews.metricas.revenueSparkline;
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-2 opacity-90" aria-hidden>
        <MiniSparkline values={vals} />
        <p className="mt-0.5 text-center text-[10px] uppercase tracking-wider text-violet-300/35">
          Vendas · 7 dias
        </p>
      </div>
    );
  }

  if (kind === "estoque" && previews.estoque) {
    const { totalPieces, bars } = previews.estoque;
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-2" aria-hidden>
        {bars.length > 0 ? (
          <MiniBars bars={bars} />
        ) : null}
        <p className="mt-1 text-center text-[11px] font-medium text-violet-300/40">
          {totalPieces.toLocaleString("pt-BR")} peças no catálogo
        </p>
      </div>
    );
  }

  return null;
}

function AdminModuleCard({
  card,
  previews,
  pendingFallback,
}: {
  card: CardDef;
  previews: HomePreviews | null;
  pendingFallback: number | null;
}) {
  const hasPreview = card.preview != null;

  return (
    <Link
      href={card.href}
      className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl border border-violet-400/25 p-5 shadow-xl shadow-violet-950/30 ring-1 ring-inset ring-white/10 transition duration-300 hover:-translate-y-0.5 hover:border-violet-300/40 hover:shadow-2xl hover:shadow-violet-950/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
      style={{
        background:
          "radial-gradient(120% 90% at 0% 0%, rgba(167, 139, 250, 0.22) 0%, transparent 55%), radial-gradient(90% 70% at 100% 100%, rgba(192, 132, 252, 0.15) 0%, transparent 50%), linear-gradient(145deg, #2e106b 0%, #4c1d95 38%, #3b0764 72%, #1e1b4b 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.02)_28%,transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
        aria-hidden
      />

      <CardPreview
        kind={card.preview}
        previews={previews}
        pendingFallback={pendingFallback}
      />

      <div className={`relative z-10 ${hasPreview ? "max-w-[58%]" : ""}`}>
        <h2 className="text-xl font-semibold tracking-tight text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)] sm:text-2xl">
          {card.title}
        </h2>
      </div>

      <span className="relative z-10 mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-violet-100/90 transition group-hover:gap-2 group-hover:text-white">
        Acessar
        <span className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
          →
        </span>
      </span>

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-br from-violet-300/10 via-transparent to-fuchsia-300/10" />
      </div>
    </Link>
  );
}

export function AdminHomeCards() {
  const { isOwner, pendingOrdersCount, adminFetch } = useAdminAuth();
  const [previews, setPreviews] = useState<HomePreviews | null>(null);

  const loadPreviews = useCallback(async () => {
    try {
      const tz = String(new Date().getTimezoneOffset());
      const res = await adminFetch(
        `/api/admin/home-previews?tzOffsetMinutes=${encodeURIComponent(tz)}`
      );
      if (!res.ok) return;
      setPreviews((await res.json()) as HomePreviews);
    } catch {
      /* ignore */
    }
  }, [adminFetch]);

  useEffect(() => {
    void loadPreviews();
  }, [loadPreviews]);

  const visible = cards.filter((c) => !c.ownerOnly || isOwner);

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((c) => (
        <AdminModuleCard
          key={c.href}
          card={c}
          previews={previews}
          pendingFallback={pendingOrdersCount}
        />
      ))}
    </div>
  );
}
