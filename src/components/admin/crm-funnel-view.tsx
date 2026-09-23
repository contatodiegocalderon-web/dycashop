"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type { AbandonedOrderRow } from "@/app/api/admin/abandoned-carts/route";
import type { OpenOrderRow } from "@/app/api/admin/crm/open-orders/route";
import type { ReactivationQueueGroup } from "@/app/api/admin/clients/reactivation-queue/route";
import { CAMPAIGN_META, type ReactivationCampaign } from "@/lib/crm-reactivation";
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
  CRM_COLUMN_PREVIEW,
  type CrmFunnelTab,
  type CrmProfileFilter,
  type CrmVolumeTier,
  volumeTierLabel,
} from "@/lib/crm-funnel";
import { SITE_VAREJO_SELLER } from "@/lib/crm-legacy-import";
import { totalsByCategoryFromOrderItems, formatOrderItemsPhrase } from "@/lib/order-category-totals";
import { abandonedCartRecoveryMessage } from "@/lib/crm-reactivation";
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
  bot_dispatch_count?: number;
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
  hoje: {
    step: "Hoje",
    title: "Tarefas",
    accent: "border-t-violet-500",
    color: "bg-violet-600",
    colorActive: "bg-violet-700",
    colorMuted: "text-violet-800",
    colorBorder: "border-violet-300",
  },
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
  return abandonedCartRecoveryMessage(
    order.customer_name,
    formatOrderItemsPhrase(order.order_items),
    order.business_profile,
    order.has_paid_before
  );
}

function botLeadFromPipelineItem(item: {
  customer_whatsapp: string;
  customer_name: string | null;
  order_items?: AbandonedOrderRow["order_items"];
}): BotSelectedLead {
  const summary = Array.isArray(item.order_items)
    ? formatOrderItemsPhrase(item.order_items)
    : "";
  return {
    customer_whatsapp: item.customer_whatsapp,
    customer_name: item.customer_name,
    order_summary: summary || null,
  };
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
        const columnLeads: BotSelectedLead[] = list.map((item) =>
          botLeadFromPipelineItem(item)
        );
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
              const lead: BotSelectedLead = botLeadFromPipelineItem(item);
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
  const dispatchCount = c.bot_dispatch_count ?? 0;
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {dispatchCount > 0 ? (
            <DispatchCountBadge count={dispatchCount} />
          ) : null}
          <p className="font-semibold text-stone-900">{c.customer_name ?? "—"}</p>
        </div>
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

const CAMPAIGN_CHIP: Record<ReactivationCampaign, string> = {
  abandon_new: "bg-amber-100 text-amber-950",
  abandon_repeat: "bg-orange-100 text-orange-950",
  day20: "bg-emerald-100 text-emerald-950",
  day45: "bg-orange-100 text-orange-950",
  day60: "bg-rose-100 text-rose-950",
};

function DailyTaskCard({
  task,
  busy,
  onWhatsApp,
  onDone,
}: {
  task: ReactivationQueueGroup["tasks"][number];
  busy: boolean;
  onWhatsApp: () => void;
  onDone: () => void;
}) {
  const meta = CAMPAIGN_META[task.campaign];
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CAMPAIGN_CHIP[task.campaign]}`}
        >
          {meta.stage} · {meta.title}
        </span>
        <span className="text-[11px] font-medium text-stone-500">
          {task.days} {task.days === 1 ? "dia" : "dias"}
        </span>
      </div>
      <p className="mt-2 text-base font-semibold leading-snug text-stone-900">
        {task.customer_name?.trim() || "Sem nome"}
      </p>
      <p className="text-xs text-stone-500">{waDisplay(task.customer_whatsapp)}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-600">
        {meta.hint}
      </p>
      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-stone-50 px-3 py-2 text-[12px] leading-relaxed text-stone-700">
        {task.message}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onWhatsApp}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white active:bg-[#1da851]"
        >
          WhatsApp
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDone}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-stone-900 px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Enviado"}
        </button>
      </div>
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

/** Círculo com quantas vezes o lead já recebeu disparo do bot. */
function DispatchCountBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span
      className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-black tabular-nums text-white shadow-sm ring-2 ring-violet-200"
      title={`Já recebeu ${count} disparo${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
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
  botDispatchCount,
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
  botDispatchCount?: number;
}) {
  const dispatchCount = botDispatchCount ?? 0;
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
            {dispatchCount > 0 ? (
              <DispatchCountBadge count={dispatchCount} />
            ) : null}
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
  const [activeTab, setActiveTab] = useState<CrmFunnelTab>("hoje");
  const [profileFilter, setProfileFilter] = useState<CrmProfileFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FunnelStats | null>(null);

  const [abandoned, setAbandoned] = useState<AbandonedOrderRow[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrderRow[]>([]);
  const [clients, setClients] = useState<CrmClientRow[]>([]);
  const [queueGroups, setQueueGroups] = useState<ReactivationQueueGroup[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueStage5Waiting, setQueueStage5Waiting] = useState(0);
  const [doneBusy, setDoneBusy] = useState<string | null>(null);
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
    if (activeTab === "mapa" || activeTab === "hoje") setActiveTab("abandonados");
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

  const loadQueue = useCallback(async () => {
    const q = new URLSearchParams();
    if (isOwner && sellerScope && sellerScope !== "all") {
      q.set("sellerScope", sellerScope);
    }
    const qs = q.toString();
    const res = await adminFetch(
      `/api/admin/clients/reactivation-queue${qs ? `?${qs}` : ""}`
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        [data.error, data.hint].filter(Boolean).join(" — ") ||
          "Falha ao carregar tarefas"
      );
    }
    setQueueGroups((data.groups ?? []) as ReactivationQueueGroup[]);
    setQueueTotal(Number(data.total) || 0);
    setQueueStage5Waiting(Number(data.stage5_waiting) || 0);
  }, [adminFetch, isOwner, sellerScope]);

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
      if (activeTab === "hoje") await loadQueue();
      else if (activeTab === "abandonados") await loadAbandoned();
      else if (activeTab === "em_aberto") await loadOpen();
      else if (activeTab === "mapa") {
        /* map panel loads itself */
      } else await loadClients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadQueue, loadAbandoned, loadOpen, loadClients]);

  const onBotCampaignCompleted = useCallback(() => {
    void load();
    void loadStats();
  }, [load, loadStats]);

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

  async function confirmQueueTask(
    task: ReactivationQueueGroup["tasks"][number]
  ) {
    const key = `${task.customer_whatsapp}|${task.campaign}|${task.cycle_anchor}`;
    setDoneBusy(key);
    try {
      const res = await adminFetch("/api/admin/clients/reactivation-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_whatsapp: task.customer_whatsapp,
          campaign: task.campaign,
          cycle_anchor: task.cycle_anchor,
          staff_id: task.staff_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? data.hint ?? "Falha ao confirmar");
      }
      await loadQueue();
      if (task.campaign === "abandon_new" || task.campaign === "abandon_repeat") {
        await loadAbandoned();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setDoneBusy(null);
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

  const openTaskFollowUps = abandoned.filter((o) => !o.follow_up_done).length;
  const doneTaskFollowUps = abandoned.length - openTaskFollowUps;

  function tabCount(tab: CrmFunnelTab): number | null {
    if (tab === "hoje") return queueTotal;
    const key = TAB_META[tab].statKey;
    if (!key || !stats) return null;
    return stats[key];
  }

  const showFilters = activeTab !== "mapa";
  const isToday = activeTab === "hoje";

  return (
    <div>
      <div
        role="tablist"
        className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Etapas do funil CRM"
      >
        {(Object.keys(TAB_META) as CrmFunnelTab[]).map((tab) => {
          const meta = TAB_META[tab];
          const count = tabCount(tab);
          const active = activeTab === tab;
          const isPrimary = tab === "hoje";
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-full px-3 py-2 text-left transition ${
                isPrimary
                  ? active
                    ? "bg-stone-900 text-white shadow-sm"
                    : "border border-stone-300 bg-white text-stone-800"
                  : active
                    ? `${meta.colorActive} text-white shadow-sm`
                    : "border border-stone-200 bg-white text-stone-700"
              }`}
            >
              <span
                className={`block text-[10px] font-semibold uppercase tracking-wider ${
                  active
                    ? "text-white/80"
                    : isPrimary
                      ? "text-stone-500"
                      : meta.colorMuted
                }`}
              >
                {meta.step}
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5 text-sm font-bold">
                <span>{meta.title}</span>
                {count !== null && tab !== "mapa" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-stone-100 text-stone-700"
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
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          {isOwner && sellerFilterOptions.length > 0 && (
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-stone-600">
                Vendedor
              </label>
              <select
                value={sellerScope}
                onChange={(e) => onSellerScopeChange(e.target.value)}
                className="min-h-11 rounded-xl border border-stone-300 px-3 py-2 text-sm"
              >
                {sellerFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isToday ? (
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-stone-600">Perfil</label>
              <select
                value={profileFilter}
                onChange={(e) =>
                  setProfileFilter(e.target.value as CrmProfileFilter)
                }
                className="min-h-11 rounded-xl border border-stone-300 px-3 py-2 text-sm"
              >
                {PROFILE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!isToday ? importControls : null}
          <button
            type="button"
            onClick={() => {
              void load();
              void loadStats();
            }}
            disabled={loading}
            className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Atualizar"}
          </button>
          {!isToday ? (
            <button
              type="button"
              onClick={() => setBotOpen(true)}
              className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-violet-700"
            >
              Ligar bot
            </button>
          ) : null}
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
            onCampaignCompleted={onBotCampaignCompleted}
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

      {activeTab === "hoje" && (
        <div>
          <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-900 px-4 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Fila de hoje
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {queueTotal.toLocaleString("pt-BR")}{" "}
              <span className="text-base font-semibold text-white/70">
                {queueTotal === 1 ? "lead" : "leads"}
              </span>
            </p>
            <p className="mt-1 text-sm text-white/70">
              Envie a mensagem e toque em Enviado. O lead sai da fila.
              {queueStage5Waiting > 0
                ? ` Etapa 5: +${queueStage5Waiting.toLocaleString("pt-BR")} na espera (entra de 5 em 5).`
                : ""}
            </p>
          </div>
          {loading && queueGroups.length === 0 ? (
            <p className="text-sm text-stone-500">A carregar tarefas…</p>
          ) : queueTotal === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
              <p className="font-semibold text-stone-800">Nada pendente agora</p>
              <p className="mt-1 text-sm text-stone-500">
                Os leads entram sozinhos no prazo de cada fase. Volta amanhã.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {queueGroups.map((g) => {
                const byCampaign: Partial<
                  Record<ReactivationCampaign, typeof g.tasks>
                > = {};
                for (const task of g.tasks) {
                  const list = byCampaign[task.campaign] ?? [];
                  list.push(task);
                  byCampaign[task.campaign] = list;
                }
                const order: ReactivationCampaign[] = [
                  "abandon_new",
                  "abandon_repeat",
                  "day20",
                  "day45",
                  "day60",
                ];
                return (
                <section key={g.staff_key}>
                  <header className="sticky top-[52px] z-10 -mx-1 mb-3 flex items-center justify-between gap-2 rounded-xl bg-stone-100/95 px-2 py-2 backdrop-blur">
                    <h2 className="text-sm font-bold text-stone-900">
                      {g.seller_name}
                    </h2>
                    <p className="text-xs font-medium text-stone-500">
                      {g.tasks.length}{" "}
                      {g.tasks.length === 1 ? "tarefa" : "tarefas"}
                      {g.stage5_waiting > 0
                        ? ` · +${g.stage5_waiting} etapa 5`
                        : ""}
                    </p>
                  </header>
                  <div className="space-y-5">
                    {order.map((campaign) => {
                      const list = byCampaign[campaign];
                      if (!list?.length) return null;
                      const meta = CAMPAIGN_META[campaign];
                      return (
                        <div key={campaign}>
                          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                            {meta.stage} · {meta.title} ({list.length})
                          </p>
                          <div className="grid gap-3">
                            {list.map((task) => {
                              const busyKey = `${task.customer_whatsapp}|${task.campaign}|${task.cycle_anchor}`;
                              return (
                                <DailyTaskCard
                                  key={busyKey}
                                  task={task}
                                  busy={doneBusy === busyKey}
                                  onWhatsApp={() =>
                                    window.open(
                                      waLink(
                                        task.customer_whatsapp,
                                        task.message
                                      ),
                                      "_blank",
                                      "noopener,noreferrer"
                                    )
                                  }
                                  onDone={() => void confirmQueueTask(task)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                );
              })}
            </div>
          )}
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
          {abandoned.length > 0 && !botSelectMode && (
            <p className="mb-4 text-sm text-stone-600">
              Follow-up nas{" "}
              <span className="font-semibold text-stone-800">Tarefas</span>
              {": "}
              <span className="font-semibold text-amber-800">
                {openTaskFollowUps} em aberto
              </span>
              {" · "}
              <span className="font-semibold text-emerald-800">
                {doneTaskFollowUps} feito{doneTaskFollowUps === 1 ? "" : "s"}
              </span>
              .
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
                  hasPaidBefore={order.has_paid_before}
                  selectionMode={botSelectMode}
                  selected={isSelected}
                  cancelledOrderCount={order.cancelled_order_count}
                  hasOpenOrder={order.has_open_order}
                  botDispatchCount={order.bot_dispatch_count}
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
                    <p
                      className={`mt-2 rounded-lg border px-2 py-1 text-[10px] font-semibold ${
                        order.follow_up_done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                    >
                      Tarefas · {order.follow_up_done ? "feito" : "em aberto"}
                    </p>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() =>
                        void trackWhatsAppClick(order.customer_whatsapp, msg)
                      }
                      className="rounded-md bg-[#25D366] px-3 py-1.5 text-[11px] font-semibold text-white"
                    >
                      WhatsApp
                    </button>
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
                  botDispatchCount={order.bot_dispatch_count}
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
