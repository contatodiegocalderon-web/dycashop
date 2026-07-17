"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import type { OpenOrderRow } from "@/app/api/admin/crm/open-orders/route";
import { ClientProfileBadge } from "@/components/client-profile-badge";
import { ClientsBrazilMapPanel } from "@/components/admin/clients-brazil-map-panel";
import { CrmBotPanel } from "@/components/admin/crm-bot-panel";
import {
  botLeadKey,
  botLeadsFromMap,
  toggleBotColumnInMap,
  toggleBotLeadInMap,
  type BotSelectedLead,
} from "@/lib/crm-bot/selection";
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
  selectionMode,
  columnLeads,
  selectedWa,
  onToggleColumn,
}: {
  columnKey: string;
  title: string;
  subtitle?: string;
  count: number;
  accentClass: string;
  children: React.ReactNode[];
  selectionMode?: boolean;
  columnLeads?: BotSelectedLead[];
  selectedWa?: Set<string>;
  onToggleColumn?: (leads: BotSelectedLead[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = expanded ? children : children.slice(0, CRM_COLUMN_PREVIEW);
  const hidden = Math.max(0, children.length - CRM_COLUMN_PREVIEW);
  const allColumnSelected =
    !!selectionMode &&
    !!columnLeads &&
    columnLeads.length > 0 &&
    columnLeads.every((l) => selectedWa?.has(botLeadKey(l.customer_whatsapp)));

  return (
    <section
      key={columnKey}
      className="flex w-[min(100%,300px)] shrink-0 flex-col rounded-xl border border-stone-200/90 bg-stone-100/70 shadow-sm"
    >
      <header
        className={`rounded-t-xl border-b border-stone-200 bg-white px-4 py-3 ${accentClass} border-t-4`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-900">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>
            ) : null}
            <p className="mt-1.5 text-xs font-semibold text-stone-600">
              {count} {count === 1 ? "lead" : "leads"}
            </p>
          </div>
          {selectionMode && columnLeads && columnLeads.length > 0 ? (
            <button
              type="button"
              onClick={() => onToggleColumn?.(columnLeads)}
              className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-900 hover:bg-violet-100"
            >
              {allColumnSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          ) : null}
        </div>
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

function VolumePipeline<
  T extends {
    volume_tier: CrmVolumeTier;
    customer_whatsapp: string;
    customer_name: string | null;
  },
>({
  items,
  renderCard,
  selectionMode,
  selectedWa,
  onToggleLead,
  onToggleColumn,
}: {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  selectionMode?: boolean;
  selectedWa?: Set<string>;
  onToggleLead?: (lead: BotSelectedLead) => void;
  onToggleColumn?: (leads: BotSelectedLead[]) => void;
}) {
  const tiers: Array<{ tier: CrmVolumeTier; accent: string }> = [
    { tier: "atacado", accent: "border-t-indigo-500" },
    { tier: "varejo", accent: "border-t-teal-500" },
  ];

  return (
    <PipelineBoard>
      {tiers.map(({ tier, accent }) => {
        const list = items.filter((i) => i.volume_tier === tier);
        const columnLeads: BotSelectedLead[] = list.map((item) => ({
          customer_whatsapp: item.customer_whatsapp,
          customer_name: item.customer_name,
        }));
        return (
          <PipelineColumn
            key={tier}
            columnKey={tier}
            title={volumeTierLabel(tier)}
            count={list.length}
            accentClass={accent}
            selectionMode={selectionMode}
            columnLeads={columnLeads}
            selectedWa={selectedWa}
            onToggleColumn={onToggleColumn}
          >
            {list.map((item) => {
              const rowKey =
                "order_id" in item && typeof item.order_id === "string"
                  ? item.order_id
                  : item.customer_whatsapp;
              const lead: BotSelectedLead = {
                customer_whatsapp: item.customer_whatsapp,
                customer_name: item.customer_name,
              };
              const selected =
                !!selectedWa?.has(botLeadKey(item.customer_whatsapp));
              return (
                <div
                  key={rowKey}
                  role={selectionMode ? "button" : undefined}
                  tabIndex={selectionMode ? 0 : undefined}
                  onClick={
                    selectionMode
                      ? () => onToggleLead?.(lead)
                      : undefined
                  }
                  onKeyDown={
                    selectionMode
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleLead?.(lead);
                          }
                        }
                      : undefined
                  }
                  className={
                    selectionMode
                      ? `cursor-pointer rounded-lg transition ${
                          selected
                            ? "ring-2 ring-violet-500 ring-offset-1"
                            : "hover:ring-1 hover:ring-violet-300"
                        }`
                      : undefined
                  }
                >
                  {renderCard(item)}
                </div>
              );
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
  selectionMode,
  selectedWa,
  onToggleLead,
  onToggleColumn,
}: {
  clients: CrmClientRow[];
  profileFilter: CrmProfileFilter;
  selectionMode?: boolean;
  selectedWa?: Set<string>;
  onToggleLead?: (lead: BotSelectedLead) => void;
  onToggleColumn?: (leads: BotSelectedLead[]) => void;
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
      {colsToShow.map(({ key, label, accent }) => {
        const columnLeads: BotSelectedLead[] = groups[key].map((c) => ({
          customer_whatsapp: c.customer_whatsapp,
          customer_name: c.customer_name,
        }));
        return (
          <PipelineColumn
            key={key}
            columnKey={key}
            title={label}
            count={groups[key].length}
            accentClass={accent}
            selectionMode={selectionMode}
            columnLeads={columnLeads}
            selectedWa={selectedWa}
            onToggleColumn={onToggleColumn}
          >
            {groups[key].map((c) => {
              const lead: BotSelectedLead = {
                customer_whatsapp: c.customer_whatsapp,
                customer_name: c.customer_name,
              };
              const selected = !!selectedWa?.has(botLeadKey(c.customer_whatsapp));
              return (
                <div
                  key={c.customer_whatsapp}
                  role={selectionMode ? "button" : undefined}
                  tabIndex={selectionMode ? 0 : undefined}
                  onClick={
                    selectionMode ? () => onToggleLead?.(lead) : undefined
                  }
                  onKeyDown={
                    selectionMode
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleLead?.(lead);
                          }
                        }
                      : undefined
                  }
                  className={
                    selectionMode
                      ? `cursor-pointer rounded-lg transition ${
                          selected
                            ? "ring-2 ring-violet-500 ring-offset-1"
                            : "hover:ring-1 hover:ring-violet-300"
                        }`
                      : undefined
                  }
                >
                  <ClientCard
                    client={c}
                    selectionMode={selectionMode}
                    selected={selected}
                  />
                </div>
              );
            })}
          </PipelineColumn>
        );
      })}
    </PipelineBoard>
  );
}

function ClientCard({
  client: c,
  selectionMode,
  selected,
}: {
  client: CrmClientRow;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  return (
    <article
      className={`rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${
        selected ? "border-violet-400 bg-violet-50/40" : "border-stone-200"
      }`}
    >
      {selectionMode ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
          {selected ? "✓ Selecionado" : "Clique para selecionar"}
        </p>
      ) : null}
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
        onClick={(e) => e.stopPropagation()}
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
  selectionMode,
  selected,
  onRemove,
  cancelledOrderCount,
  hasOpenOrder,
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
  selectionMode?: boolean;
  selected?: boolean;
  onRemove?: () => void;
  cancelledOrderCount?: number;
  hasOpenOrder?: boolean;
}) {
  return (
    <article
      className={`relative rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${
        selected
          ? "border-violet-400 bg-violet-50/40 ring-0"
          : hasPaidBefore
            ? "border-amber-300 ring-1 ring-amber-200/80"
            : "border-stone-200"
      }`}
    >
      {selectionMode ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
          {selected ? "✓ Selecionado" : "Clique para selecionar"}
        </p>
      ) : null}
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
          {cancelledOrderCount != null && cancelledOrderCount > 1 ? (
            <p className="mt-0.5 text-[10px] font-semibold text-stone-600">
              {cancelledOrderCount} pedidos abandonados
            </p>
          ) : null}
          {hasOpenOrder ? (
            <p className="mt-1 inline-flex rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
              Pedido em aberto
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
        <div
          className="flex shrink-0 flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </div>
      {onRemove && !selectionMode ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-base font-bold leading-none text-red-600 hover:bg-red-50"
          title="Remover da lista"
          aria-label="Remover lead"
        >
          ×
        </button>
      ) : null}
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
  const [hideConfirm, setHideConfirm] = useState<{
    wa: string;
    name: string | null;
  } | null>(null);
  const [hideBusy, setHideBusy] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [botSelectMode, setBotSelectMode] = useState(false);
  const [selectedBotLeads, setSelectedBotLeads] = useState<
    Map<string, BotSelectedLead>
  >(() => new Map());

  const selectedWa = useMemo(
    () => new Set(selectedBotLeads.keys()),
    [selectedBotLeads]
  );
  const selectedBotCount = selectedBotLeads.size;

  const toggleBotLead = useCallback((lead: BotSelectedLead) => {
    setSelectedBotLeads((prev) => toggleBotLeadInMap(prev, lead));
  }, []);

  const toggleBotColumn = useCallback((leads: BotSelectedLead[]) => {
    setSelectedBotLeads((prev) => toggleBotColumnInMap(prev, leads));
  }, []);

  const startBotSelection = useCallback(() => {
    setBotSelectMode(true);
    if (activeTab === "mapa") setActiveTab("abandonados");
  }, [activeTab]);

  const closeBotSelection = useCallback(() => {
    setBotSelectMode(false);
  }, []);

  const closeBotPanel = useCallback(() => {
    setBotOpen(false);
    setBotSelectMode(false);
    setSelectedBotLeads(new Map());
  }, []);

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

  async function confirmHideAbandoned() {
    if (!hideConfirm) return;
    setHideBusy(true);
    try {
      const res = await adminFetch("/api/admin/abandoned-carts/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_whatsapp: hideConfirm.wa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
      setAbandoned((prev) =>
        prev.filter((o) => o.customer_whatsapp !== hideConfirm.wa)
      );
      setSelectedBotLeads((prev) => {
        const next = new Map(prev);
        next.delete(botLeadKey(hideConfirm.wa));
        return next;
      });
      setHideConfirm(null);
      void loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setHideBusy(false);
    }
  }

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
          <button
            type="button"
            onClick={() => setBotOpen(true)}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700"
          >
            Ligar bot
          </button>
        </div>
      )}

      {botOpen && (
        <div className="mb-6">
          <CrmBotPanel
            sellerScope={sellerScope}
            selectedLeads={botLeadsFromMap(selectedBotLeads)}
            selectionMode={botSelectMode}
            onStartSelection={startBotSelection}
            onCloseSelection={closeBotSelection}
            onClose={closeBotPanel}
          />
        </div>
      )}

      {botOpen && botSelectMode && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-300 bg-violet-100 px-4 py-3 shadow-md">
          <p className="text-sm font-bold text-violet-950">
            {selectedBotCount}{" "}
            {selectedBotCount === 1 ? "lead selecionado" : "leads selecionados"}
          </p>
          <p className="text-xs text-violet-800">
            Clique nos cards do funil para adicionar ou remover leads.
          </p>
          <button
            type="button"
            onClick={closeBotSelection}
            className="rounded-lg border border-violet-400 bg-white px-4 py-2 text-xs font-bold text-violet-900 hover:bg-violet-50"
          >
            Fechar lista
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeTab === "mapa" && !botSelectMode && <ClientsBrazilMapPanel active />}

      {activeTab === "mapa" && botSelectMode && (
        <p className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Selecione uma etapa do funil (Abandonados, Em aberto, etc.) para escolher
          leads.
        </p>
      )}

      {activeTab === "abandonados" && (
        <div>
          {pendingFollowUps > 0 && !botSelectMode && (
            <p className="mb-4 text-sm">
              <span className="font-semibold text-violet-800">
                {pendingFollowUps} aguardando follow-up.
              </span>
            </p>
          )}
          <VolumePipeline
            items={abandoned}
            selectionMode={botSelectMode}
            selectedWa={selectedWa}
            onToggleLead={toggleBotLead}
            onToggleColumn={toggleBotColumn}
            renderCard={(order) => {
              const msg = recoveryMessage(order);
              const lines = totalsByCategoryFromOrderItems(
                order.order_items
              ).map((c) => `x${c.qty} ${c.label.toUpperCase()}`);
              const alert = nextFollowUpLabel(order.follow_up_count);
              const isSelected = selectedWa.has(
                botLeadKey(order.customer_whatsapp)
              );
              return (
                <OrderMiniCard
                  key={order.customer_whatsapp}
                  name={order.customer_name}
                  wa={order.customer_whatsapp}
                  pieces={order.total_pieces}
                  seller={order.requested_seller_name}
                  createdAt={order.created_at}
                  profile={order.business_profile}
                  hasPaidBefore={order.has_paid_before || !!order.business_profile}
                  selectionMode={botSelectMode}
                  selected={isSelected}
                  cancelledOrderCount={order.cancelled_order_count}
                  hasOpenOrder={order.has_open_order}
                  onRemove={
                    botSelectMode
                      ? undefined
                      : () =>
                          setHideConfirm({
                            wa: order.customer_whatsapp,
                            name: order.customer_name,
                          })
                  }
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
            selectionMode={botSelectMode}
            selectedWa={selectedWa}
            onToggleLead={toggleBotLead}
            onToggleColumn={toggleBotColumn}
            renderCard={(order) => {
              const lines = totalsByCategoryFromOrderItems(
                order.order_items
              ).map((c) => `x${c.qty} ${c.label.toUpperCase()}`);
              const isSelected = selectedWa.has(
                botLeadKey(order.customer_whatsapp)
              );
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
                  selectionMode={botSelectMode}
                  selected={isSelected}
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
              selectionMode={botSelectMode}
              selectedWa={selectedWa}
              onToggleLead={toggleBotLead}
              onToggleColumn={toggleBotColumn}
            />
          )}
        </div>
      )}
      {hideConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hide-abandoned-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <h3
              id="hide-abandoned-title"
              className="text-base font-bold text-stone-900"
            >
              Remover lead?
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {hideConfirm.name?.trim() || "Este contacto"} deixará de aparecer na
              etapa Abandonados. Os pedidos cancelados permanecem no sistema.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={hideBusy}
                onClick={() => setHideConfirm(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={hideBusy}
                onClick={() => void confirmHideAbandoned()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {hideBusy ? "A remover…" : "Remover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
