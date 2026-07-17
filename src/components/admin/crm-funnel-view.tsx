"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import type { OpenOrderRow } from "@/app/api/admin/crm/open-orders/route";
import { ClientProfileBadge } from "@/components/client-profile-badge";
import { ClientsBrazilMapPanel } from "@/components/admin/clients-brazil-map-panel";
import type { BusinessProfile } from "@/lib/client-follow-up";
import {
  CRM_ABANDONED_FOLLOW_UP_MAX,
  CRM_COLUMN_PREVIEW,
  followUpAlertClass,
  nextFollowUpLabel,
  type CrmFunnelTab,
  type CrmProfileFilter,
  type CrmVolumeTier,
  volumeTierLabel,
} from "@/lib/crm-funnel";
import { SITE_VAREJO_SELLER } from "@/lib/crm-legacy-import";
import { totalsByCategoryFromOrderItems } from "@/lib/order-category-totals";
import type { ClientRecencyStatus } from "@/lib/client-recency";

export type CrmClientRow = {
  customer_whatsapp: string;
  customer_name: string | null;
  customer_segment: string | null;
  is_new: boolean;
  order_count: number;
  total_spent: number;
  first_confirmed_at: string | null;
  last_confirmed_at: string | null;
  sellers_label: string;
  business_profile: BusinessProfile | null;
  recency_status: ClientRecencyStatus;
};

type FunnelStats = {
  abandonados: number;
  em_aberto: number;
  pos_30: number;
  pos_30_59: number;
  pos_60: number;
};

const PROFILE_FILTER_OPTIONS: Array<{ value: CrmProfileFilter; label: string }> =
  [
    { value: "all", label: "Todos os perfis" },
    { value: "lojista", label: "Lojista" },
    { value: "revendedor", label: "Revendedor" },
    { value: "uso_proprio", label: "Uso próprio" },
    { value: "sem_perfil", label: "Sem perfil" },
  ];

const TAB_META: Record<
  CrmFunnelTab,
  {
    step: string;
    title: string;
    accent: string;
    statKey?: keyof FunnelStats;
    color: string;
    colorActive: string;
    colorMuted: string;
    colorBorder: string;
  }
> = {
  abandonados: {
    step: "Etapa 1",
    title: "Abandonados",
    accent: "border-t-amber-400",
    statKey: "abandonados",
    color: "bg-amber-500",
    colorActive: "bg-amber-600",
    colorMuted: "text-amber-700",
    colorBorder: "border-amber-300",
  },
  em_aberto: {
    step: "Etapa 2",
    title: "Em aberto",
    accent: "border-t-sky-500",
    statKey: "em_aberto",
    color: "bg-sky-500",
    colorActive: "bg-sky-600",
    colorMuted: "text-sky-700",
    colorBorder: "border-sky-300",
  },
  pos_30: {
    step: "Etapa 3",
    title: "Comprou < 30d",
    accent: "border-t-emerald-500",
    statKey: "pos_30",
    color: "bg-emerald-500",
    colorActive: "bg-emerald-600",
    colorMuted: "text-emerald-700",
    colorBorder: "border-emerald-300",
  },
  pos_30_59: {
    step: "Etapa 4",
    title: "30–59 dias",
    accent: "border-t-orange-400",
    statKey: "pos_30_59",
    color: "bg-orange-500",
    colorActive: "bg-orange-600",
    colorMuted: "text-orange-700",
    colorBorder: "border-orange-300",
  },
  pos_60: {
    step: "Etapa 5",
    title: "60+ dias",
    accent: "border-t-rose-500",
    statKey: "pos_60",
    color: "bg-rose-500",
    colorActive: "bg-rose-600",
    colorMuted: "text-rose-700",
    colorBorder: "border-rose-300",
  },
  mapa: {
    step: "Extra",
    title: "Mapa",
    accent: "border-t-violet-500",
    color: "bg-violet-500",
    colorActive: "bg-violet-600",
    colorMuted: "text-violet-700",
    colorBorder: "border-violet-300",
  },
};

function waDisplay(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 11) return d;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function waLink(digits: string, text?: string) {
  const base = `https://wa.me/${digits.replace(/\D/g, "")}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

function money(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function recoveryMessage(order: AbandonedOrderRow): string {
  const first = order.customer_name?.trim().split(/\s+/)[0];
  const hi = first ? `Olá ${first}!` : "Olá!";
  if (order.requested_seller_name?.trim() === SITE_VAREJO_SELLER) {
    return `${hi} Vi que você deixou itens no carrinho do site. Posso ajudar a finalizar?`;
  }
  const cats = totalsByCategoryFromOrderItems(order.order_items);
  const summary = cats.map((c) => `x${c.qty} ${c.label}`).join("\n");
  return summary
    ? `${hi}\n\nVi que você deixou itens no carrinho:\n${summary}\n\nPosso ajudar a finalizar?`
    : `${hi} Vi que você deixou itens no carrinho. Posso ajudar a finalizar?`;
}

function PipelineColumn({
  columnKey,
  title,
  subtitle,
  count,
  accentClass,
  children,
}: {
  columnKey: string;
  title: string;
  subtitle?: string;
  count: number;
  accentClass: string;
  children: React.ReactNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = expanded ? children : children.slice(0, CRM_COLUMN_PREVIEW);
  const hidden = Math.max(0, children.length - CRM_COLUMN_PREVIEW);

  return (
    <section
      key={columnKey}
      className="flex w-[min(100%,300px)] shrink-0 flex-col rounded-xl border border-stone-200/90 bg-stone-100/70 shadow-sm"
    >
      <header
        className={`rounded-t-xl border-b border-stone-200 bg-white px-4 py-3 ${accentClass} border-t-4`}
      >
        <h3 className="text-sm font-bold text-stone-900">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>
        ) : null}
        <p className="mt-1.5 text-xs font-semibold text-stone-600">
          {count} {count === 1 ? "lead" : "leads"}
        </p>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {preview.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-stone-400">Nenhum</p>
        ) : (
          preview
        )}
      </div>
      {hidden > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mx-2 mb-2 rounded-lg border border-stone-300 bg-white py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Ver mais ({hidden})
        </button>
      ) : null}
      {expanded && hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mx-2 mb-2 rounded-lg border border-stone-200 bg-stone-50 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100"
        >
          Ver menos
        </button>
      ) : null}
    </section>
  );
}

function PipelineBoard({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto pb-2">
      <div className="flex min-w-min gap-4 px-1">{children}</div>
    </div>
  );
}

function VolumePipeline<T extends { volume_tier: CrmVolumeTier }>({
  items,
  renderCard,
}: {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
}) {
  const tiers: Array<{ tier: CrmVolumeTier; accent: string }> = [
    { tier: "atacado", accent: "border-t-indigo-500" },
    { tier: "varejo", accent: "border-t-teal-500" },
  ];

  return (
    <PipelineBoard>
      {tiers.map(({ tier, accent }) => {
        const list = items.filter((i) => i.volume_tier === tier);
        return (
          <PipelineColumn
            key={tier}
            columnKey={tier}
            title={volumeTierLabel(tier)}
            count={list.length}
            accentClass={accent}
          >
            {list.map((item) => {
              const rowKey =
                "order_id" in item && typeof item.order_id === "string"
                  ? item.order_id
                  : "customer_whatsapp" in item &&
                      typeof item.customer_whatsapp === "string"
                    ? item.customer_whatsapp
                    : JSON.stringify(item);
              return <div key={rowKey}>{renderCard(item)}</div>;
            })}
          </PipelineColumn>
        );
      })}
    </PipelineBoard>
  );
}

function ProfilePipeline({
  clients,
  profileFilter,
}: {
  clients: CrmClientRow[];
  profileFilter: CrmProfileFilter;
}) {
  const groups = useMemo(() => {
    const g = {
      lojista: [] as CrmClientRow[],
      revendedor: [] as CrmClientRow[],
      uso_proprio: [] as CrmClientRow[],
    };
    for (const c of clients) {
      if (c.business_profile === "lojista") g.lojista.push(c);
      else if (c.business_profile === "revendedor") g.revendedor.push(c);
      else if (c.business_profile === "uso_proprio") g.uso_proprio.push(c);
    }
    return g;
  }, [clients]);

  const cols: Array<{
    key: keyof typeof groups;
    label: string;
    accent: string;
  }> = [
    { key: "lojista", label: "Lojista", accent: "border-t-blue-500" },
    {
      key: "revendedor",
      label: "Revendedor",
      accent: "border-t-violet-500",
    },
    {
      key: "uso_proprio",
      label: "Uso próprio",
      accent: "border-t-emerald-500",
    },
  ];

  const colsToShow =
    profileFilter === "all" || profileFilter === "sem_perfil"
      ? cols
      : cols.filter((c) => c.key === profileFilter);

  return (
    <PipelineBoard>
      {colsToShow.map(({ key, label, accent }) => (
        <PipelineColumn
          key={key}
          columnKey={key}
          title={label}
          count={groups[key].length}
          accentClass={accent}
        >
          {groups[key].map((c) => (
            <ClientCard key={c.customer_whatsapp} client={c} />
          ))}
        </PipelineColumn>
      ))}
    </PipelineBoard>
  );
}

function ClientCard({ client: c }: { client: CrmClientRow }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-stone-900">{c.customer_name ?? "—"}</p>
        {c.business_profile ? (
          <ClientProfileBadge profile={c.business_profile} />
        ) : null}
      </div>
      <p className="text-xs text-stone-500">{waDisplay(c.customer_whatsapp)}</p>
      <p className="mt-2 text-[11px] text-stone-500">
        {c.order_count} pedido(s) · {money(c.total_spent)}
        {c.last_confirmed_at && (
          <> · {new Date(c.last_confirmed_at).toLocaleDateString("pt-BR")}</>
        )}
      </p>
      <p className="text-[11px] text-stone-400">Vendedor: {c.sellers_label}</p>
      <a
        href={waLink(c.customer_whatsapp)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex rounded-md bg-[#25D366] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#20bd5a]"
      >
        WhatsApp
      </a>
    </article>
  );
}

function RepeatBuyerBadge() {
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-white shadow-sm"
      title="Cliente que já comprou antes"
    >
      !
    </span>
  );
}

function OrderMiniCard({
  name,
  wa,
  pieces,
  seller,
  createdAt,
  lines,
  extra,
  profile,
  hasPaidBefore,
  actions,
}: {
  name: string | null;
  wa: string;
  pieces: number;
  seller: string | null;
  createdAt: string;
  lines?: string[];
  extra?: React.ReactNode;
  profile?: BusinessProfile | null;
  hasPaidBefore?: boolean;
  actions: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${
        hasPaidBefore
          ? "border-amber-300 ring-1 ring-amber-200/80"
          : "border-stone-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {hasPaidBefore ? <RepeatBuyerBadge /> : null}
            <p className="font-semibold text-stone-900">{name?.trim() || "—"}</p>
            {profile ? <ClientProfileBadge profile={profile} /> : null}
          </div>
          {hasPaidBefore ? (
            <p className="mt-0.5 text-[10px] font-semibold text-amber-700">
              Já comprou antes
            </p>
          ) : null}
          <p className="text-xs text-stone-500">{waDisplay(wa)}</p>
          <p className="mt-1 text-[11px] font-medium text-stone-600">
            {pieces} peça(s)
          </p>
          {seller?.trim() ? (
            <p className="text-[11px] text-stone-400">{seller.trim()}</p>
          ) : null}
          {lines && lines.length > 0 && (
            <ul className="mt-1 space-y-0.5 font-mono text-[10px] uppercase text-stone-600">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {extra}
          <p className="mt-1 text-[10px] text-stone-400">
            {new Date(createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">{actions}</div>
      </div>
    </article>
  );
}

type Props = {
  isOwner: boolean;
  sellerScope: string;
  onSellerScopeChange: (v: string) => void;
  sellerFilterOptions: Array<{ value: string; label: string }>;
  importControls?: React.ReactNode;
};

export function CrmFunnelView({
  isOwner,
  sellerScope,
  onSellerScopeChange,
  sellerFilterOptions,
  importControls,
}: Props) {
  const { adminFetch } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<CrmFunnelTab>("abandonados");
  const [profileFilter, setProfileFilter] = useState<CrmProfileFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FunnelStats | null>(null);

  const [abandoned, setAbandoned] = useState<AbandonedOrderRow[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrderRow[]>([]);
  const [clients, setClients] = useState<CrmClientRow[]>([]);
  const [followUpBusy, setFollowUpBusy] = useState<string | null>(null);

  const recencyForTab = useMemo((): ClientRecencyStatus | null => {
    if (activeTab === "pos_30") return "green";
    if (activeTab === "pos_30_59") return "yellow";
    if (activeTab === "pos_60") return "red";
    return null;
  }, [activeTab]);

  const filterQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (isOwner && sellerScope && sellerScope !== "all") {
      q.set("sellerScope", sellerScope);
    }
    if (profileFilter !== "all") q.set("profile", profileFilter);
    return q;
  }, [isOwner, sellerScope, profileFilter]);

  const loadStats = useCallback(async () => {
    const q = filterQuery();
    const qs = q.toString();
    const res = await adminFetch(
      `/api/admin/crm/funnel-stats${qs ? `?${qs}` : ""}`
    );
    const data = await res.json();
    if (!res.ok) return;
    setStats(data as FunnelStats);
  }, [adminFetch, filterQuery]);

  const loadAbandoned = useCallback(async () => {
    const q = filterQuery();
    const qs = q.toString();
    const res = await adminFetch(
      `/api/admin/abandoned-carts${qs ? `?${qs}` : ""}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar abandonados");
    const rows = (data.orders ?? []) as AbandonedOrderRow[];
    setAbandoned(rows);
    setStats((prev) =>
      prev ? { ...prev, abandonados: rows.length } : prev
    );
  }, [adminFetch, filterQuery]);

  const loadOpen = useCallback(async () => {
    const q = filterQuery();
    const qs = q.toString();
    const res = await adminFetch(
      `/api/admin/crm/open-orders${qs ? `?${qs}` : ""}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar em aberto");
    const rows = (data.orders ?? []) as OpenOrderRow[];
    setOpenOrders(rows);
    setStats((prev) => (prev ? { ...prev, em_aberto: rows.length } : prev));
  }, [adminFetch, filterQuery]);

  const loadClients = useCallback(async () => {
    const q = filterQuery();
    if (recencyForTab) q.set("recency", recencyForTab);
    const qs = q.toString();
    const res = await adminFetch(`/api/admin/clients${qs ? `?${qs}` : ""}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar clientes");
    const rows = (data.clients ?? []) as CrmClientRow[];
    setClients(rows);
    if (recencyForTab === "green") {
      setStats((prev) => (prev ? { ...prev, pos_30: rows.length } : prev));
    } else if (recencyForTab === "yellow") {
      setStats((prev) => (prev ? { ...prev, pos_30_59: rows.length } : prev));
    } else if (recencyForTab === "red") {
      setStats((prev) => (prev ? { ...prev, pos_60: rows.length } : prev));
    }
  }, [adminFetch, filterQuery, recencyForTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "abandonados") await loadAbandoned();
      else if (activeTab === "em_aberto") await loadOpen();
      else if (activeTab === "mapa") {
        /* map panel loads itself */
      } else await loadClients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadAbandoned, loadOpen, loadClients]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (activeTab !== "mapa") void load();
  }, [load, activeTab]);

  async function registerFollowUp(wa: string) {
    setFollowUpBusy(wa);
    try {
      const res = await adminFetch("/api/admin/abandoned-carts/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_whatsapp: wa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.hint ?? "Falha no follow-up");
      if (data.discarded) {
        setAbandoned((prev) => prev.filter((o) => o.customer_whatsapp !== wa));
      } else {
        setAbandoned((prev) =>
          prev.map((o) =>
            o.customer_whatsapp === wa
              ? {
                  ...o,
                  follow_up_count: data.follow_up_count,
                  follow_up_remaining: data.follow_up_remaining,
                }
              : o
          )
        );
      }
      void loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no follow-up");
    } finally {
      setFollowUpBusy(null);
    }
  }

  async function trackWhatsAppClick(wa: string, msg: string) {
    try {
      await adminFetch("/api/admin/abandoned-carts/whatsapp-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_whatsapp: wa }),
      });
    } catch {
      /* ignore */
    }
    window.open(waLink(wa, msg), "_blank", "noopener,noreferrer");
  }

  const pendingFollowUps = abandoned.filter(
    (o) => o.follow_up_count < CRM_ABANDONED_FOLLOW_UP_MAX
  ).length;

  function tabCount(tab: CrmFunnelTab): number | null {
    const key = TAB_META[tab].statKey;
    if (!key || !stats) return null;
    return stats[key];
  }

  const showFilters = activeTab !== "mapa";

  return (
    <div>
      <div
        role="tablist"
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Etapas do funil CRM"
      >
        {(Object.keys(TAB_META) as CrmFunnelTab[]).map((tab) => {
          const meta = TAB_META[tab];
          const count = tabCount(tab);
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              className={`min-w-[140px] rounded-xl border-2 px-4 py-3 text-left transition ${
                active
                  ? `${meta.colorActive} border-transparent text-white shadow-md`
                  : `${meta.colorBorder} border bg-white hover:brightness-[0.98]`
              }`}
            >
              <span
                className={`block text-[10px] font-semibold uppercase tracking-wider ${
                  active ? "text-white/80" : meta.colorMuted
                }`}
              >
                {meta.step}
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5 text-sm font-bold">
                <span className={active ? "text-white" : meta.colorMuted}>
                  {meta.title}
                </span>
                {count !== null && tab !== "mapa" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active
                        ? "bg-white/20 text-white"
                        : `${meta.color} text-white`
                    }`}
                  >
                    {count.toLocaleString("pt-BR")}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {showFilters && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          {isOwner && sellerFilterOptions.length > 0 && (
            <div className="flex min-w-[160px] flex-col gap-1">
              <label className="text-xs font-medium text-stone-600">
                Vendedor
              </label>
              <select
                value={sellerScope}
                onChange={(e) => onSellerScopeChange(e.target.value)}
                className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
              >
                {sellerFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex min-w-[160px] flex-col gap-1">
            <label className="text-xs font-medium text-stone-600">Perfil</label>
            <select
              value={profileFilter}
              onChange={(e) =>
                setProfileFilter(e.target.value as CrmProfileFilter)
              }
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            >
              {PROFILE_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {importControls}
          <button
            type="button"
            onClick={() => {
              void load();
              void loadStats();
            }}
            disabled={loading}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Atualizar"}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeTab === "mapa" && <ClientsBrazilMapPanel active />}

      {activeTab === "abandonados" && (
        <div>
          {pendingFollowUps > 0 && (
            <p className="mb-4 text-sm">
              <span className="font-semibold text-violet-800">
                {pendingFollowUps} aguardando follow-up.
              </span>
            </p>
          )}
          <VolumePipeline
            items={abandoned}
            renderCard={(order) => {
              const msg = recoveryMessage(order);
              const lines = totalsByCategoryFromOrderItems(
                order.order_items
              ).map((c) => `x${c.qty} ${c.label.toUpperCase()}`);
              const alert = nextFollowUpLabel(order.follow_up_count);
              return (
                <OrderMiniCard
                  key={order.order_id}
                  name={order.customer_name}
                  wa={order.customer_whatsapp}
                  pieces={order.total_pieces}
                  seller={order.requested_seller_name}
                  createdAt={order.created_at}
                  profile={order.business_profile}
                  hasPaidBefore={order.has_paid_before || !!order.business_profile}
                  lines={
                    order.requested_seller_name?.trim() === SITE_VAREJO_SELLER
                      ? undefined
                      : lines
                  }
                  extra={
                    alert ? (
                      <p
                        className={`mt-2 rounded-lg border px-2 py-1 text-[10px] font-semibold ${followUpAlertClass(order.follow_up_count)}`}
                      >
                        {alert} · {order.follow_up_count}/
                        {CRM_ABANDONED_FOLLOW_UP_MAX} feitos
                      </p>
                    ) : null
                  }
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void trackWhatsAppClick(order.customer_whatsapp, msg)
                        }
                        className="rounded-md bg-[#25D366] px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        WhatsApp
                      </button>
                      {order.follow_up_count < CRM_ABANDONED_FOLLOW_UP_MAX && (
                        <button
                          type="button"
                          disabled={followUpBusy === order.customer_whatsapp}
                          onClick={() =>
                            void registerFollowUp(order.customer_whatsapp)
                          }
                          className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-900 disabled:opacity-50"
                        >
                          {followUpBusy === order.customer_whatsapp
                            ? "…"
                            : "Follow-up"}
                        </button>
                      )}
                    </>
                  }
                />
              );
            }}
          />
        </div>
      )}

      {activeTab === "em_aberto" && (
        <div>
          <VolumePipeline
            items={openOrders}
            renderCard={(order) => {
              const lines = totalsByCategoryFromOrderItems(
                order.order_items
              ).map((c) => `x${c.qty} ${c.label.toUpperCase()}`);
              return (
                <OrderMiniCard
                  key={order.order_id}
                  name={order.customer_name}
                  wa={order.customer_whatsapp}
                  pieces={order.total_pieces}
                  seller={order.requested_seller_name}
                  createdAt={order.created_at}
                  profile={order.business_profile}
                  hasPaidBefore={order.has_paid_before || !!order.business_profile}
                  lines={lines}
                  extra={
                    order.has_paid_before || order.business_profile ? (
                      <p className="mt-1 text-[10px] font-medium text-emerald-700">
                        Cliente recorrente
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-amber-700">
                        Primeira compra pendente
                      </p>
                    )
                  }
                  actions={
                    <a
                      href={waLink(order.customer_whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-[#25D366] px-3 py-1.5 text-[11px] font-semibold text-white"
                    >
                      WhatsApp
                    </a>
                  }
                />
              );
            }}
          />
        </div>
      )}

      {(activeTab === "pos_30" ||
        activeTab === "pos_30_59" ||
        activeTab === "pos_60") && (
        <div>
          {!loading && clients.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum cliente nesta etapa.</p>
          ) : (
            <ProfilePipeline
              clients={clients}
              profileFilter={profileFilter}
            />
          )}
        </div>
      )}
    </div>
  );
}
