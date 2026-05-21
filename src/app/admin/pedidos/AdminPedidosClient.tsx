"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import type {
  CustomerSegment,
  OrderItemRow,
  OrderRow,
  ProductSize,
} from "@/types";
import { StockConflictNotice } from "@/components/stock-conflict-notice";
import { publicDriveImageUrl } from "@/lib/drive-image-url";
import { parseOrderStockConflict } from "@/lib/order-stock-conflict";

type SellerFilterOption = { value: string; label: string };

const SIZE_ORDER: ProductSize[] = ["M", "G", "GG"];

/** Placeholder 1×1 transparente — evita `<img src="">` quando falta ficheiro no snapshot. */
const EMPTY_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

function adminThumbSrc(it: OrderItemRow): string {
  const u = it.snapshot_image_url?.trim() ?? "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const fid = it.snapshot_drive_file_id?.trim();
  if (!fid) return EMPTY_IMG;
  return publicDriveImageUrl(fid, 280);
}

function groupItems(items: OrderItemRow[]) {
  const m = new Map<ProductSize, OrderItemRow[]>();
  for (const s of SIZE_ORDER) m.set(s, []);
  for (const it of items) {
    const sz = it.snapshot_size as ProductSize;
    if (m.has(sz)) m.get(sz)!.push(it);
  }
  return m;
}

function waLinkFromDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

function categoriesInOrder(order: OrderRow | undefined): string[] {
  if (!order?.order_items?.length) return [];
  const set = new Set<string>();
  for (const it of order.order_items) {
    const cat = it.snapshot_category?.trim() || "Sem categoria";
    set.add(cat);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Igual ao histórico: totais por categoria (snapshot) para o resumo no cartão. */
function aggregateByCategory(items: OrderItemRow[]): Array<{ label: string; qty: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    const cat = it.snapshot_category?.trim() || "Sem categoria";
    m.set(cat, (m.get(cat) ?? 0) + it.quantity);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([label, qty]) => ({ label, qty }));
}

function isDriveConfirmLocked(order: OrderRow): boolean {
  const raw = order.sale_amount_by_category;
  if (!raw || typeof raw !== "object") return false;
  return "_confirm_lock" in (raw as Record<string, unknown>);
}

function parseDriveRetryFromOrder(order: OrderRow): {
  skip_ids: string[];
  failed_ids: string[];
} | null {
  const raw = order.sale_amount_by_category;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const retry = o._drive_retry;
  if (!retry || typeof retry !== "object") return null;
  const r = retry as Record<string, unknown>;
  return {
    skip_ids: Array.isArray(r.skip_ids)
      ? (r.skip_ids as unknown[]).map((id) => String(id))
      : [],
    failed_ids: Array.isArray(r.failed_ids)
      ? (r.failed_ids as unknown[]).map((id) => String(id))
      : [],
  };
}

type DriveSyncLine = {
  product_id: string;
  brand: string;
  color: string;
  qty_in_order: number;
  db_stock: number;
  stock_after_confirm: number;
  drive_file_id: string;
  drive_exists: boolean;
  drive_current_name: string | null;
  expected_name_for_db_stock: string;
  expected_name_after_confirm: string | null;
  status:
    | "synced"
    | "drive_ahead"
    | "file_missing"
    | "name_mismatch"
    | "would_delete";
  hint: string;
};

type DriveDiagnosticState =
  | { loading: true }
  | {
      loading: false;
      error?: string;
      lines?: DriveSyncLine[];
      summary?: Record<string, number>;
    };

const DRIVE_STATUS_LABEL: Record<DriveSyncLine["status"], string> = {
  synced: "OK — alinhado",
  drive_ahead: "Drive à frente da base",
  file_missing: "Ficheiro não encontrado",
  name_mismatch: "Nome diferente",
  would_delete: "Seria apagado na confirmação",
};

export default function AdminPedidosClient() {
  const { adminFetch, session } = useAdminAuth();
  const isDiegoOwnerUi = session?.role === "owner" && session?.fromApiKey !== true;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorItems, setErrorItems] = useState<Array<{ productId: string; message: string }>>(
    []
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelOpenId, setCancelOpenId] = useState<string | null>(null);
  const [cancelPhrase, setCancelPhrase] = useState("");
  const [confirmOpenId, setConfirmOpenId] = useState<string | null>(null);
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>(
    {}
  );
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsApp, setCustomerWhatsApp] = useState("");
  const [customerSegment, setCustomerSegment] =
    useState<CustomerSegment>("NOVO");
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(
    null
  );
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [driveDiagnosticByOrder, setDriveDiagnosticByOrder] = useState<
    Record<string, DriveDiagnosticState>
  >({});
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>(
    {}
  );
  const [sellerScope, setSellerScope] = useState<string>("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>([]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorItems([]);
    try {
      const q = new URLSearchParams({ status: "PENDENTE_PAGAMENTO" });
      if (isDiegoOwnerUi && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
      const res = await adminFetch(`/api/admin/orders?${q.toString()}`);
      const text = await res.text();
      let data: { error?: string; orders?: OrderRow[] } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setOrders(data.orders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, isDiegoOwnerUi, sellerScope]);

  useEffect(() => {
    if (!isDiegoOwnerUi) {
      setSellerScope("all");
      setSellerFilterOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await adminFetch("/api/admin/staff-seller-filters");
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as {
          ownerStaffId?: string | null;
          ownerDisplayName?: string;
          sellers?: Array<{ id: string; displayName: string }>;
        };
        const opts: SellerFilterOption[] = [{ value: "all", label: "Todos" }];
        if (j.ownerStaffId) {
          opts.push({
            value: "me",
            label: String(j.ownerDisplayName ?? "Dono").trim() || "Dono",
          });
        }
        for (const s of j.sellers ?? []) {
          opts.push({
            value: s.id,
            label: String(s.displayName ?? "").trim() || "Vendedor",
          });
        }
        if (!cancelled) setSellerFilterOptions(opts);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetch, isDiegoOwnerUi]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  async function loadDriveDiagnostic(orderId: string) {
    setDriveDiagnosticByOrder((prev) => ({
      ...prev,
      [orderId]: { loading: true },
    }));
    try {
      const res = await adminFetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/drive-sync-diagnostic`
      );
      const data = (await res.json()) as {
        error?: string;
        lines?: DriveSyncLine[];
        summary?: Record<string, number>;
      };
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar diagnóstico");
      setDriveDiagnosticByOrder((prev) => ({
        ...prev,
        [orderId]: {
          loading: false,
          lines: data.lines ?? [],
          summary: data.summary,
        },
      }));
    } catch (e) {
      setDriveDiagnosticByOrder((prev) => ({
        ...prev,
        [orderId]: {
          loading: false,
          error: e instanceof Error ? e.message : "Erro",
        },
      }));
    }
  }

  async function unlockDriveConfirmLock(orderId: string) {
    setUnlocking(orderId);
    setError(null);
    setConfirmSuccessMsg(null);
    try {
      const res = await adminFetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/unlock-confirm-lock`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao desbloquear");
      }
      const msg =
        typeof (data as { message?: string }).message === "string"
          ? (data as { message: string }).message
          : "Bloqueio removido. Na próxima confirmação só as peças em falha serão enviadas ao Drive.";
      setConfirmSuccessMsg(msg);
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao desbloquear");
    } finally {
      setUnlocking(null);
    }
  }

  function openConfirmModal(orderId: string) {
    setConfirmSuccessMsg(null);
    const found = orders.find((o) => o.id === orderId);
    const cats = categoriesInOrder(found);
    setCategoryAmounts(Object.fromEntries(cats.map((c) => [c, ""])));
    setCustomerName(found?.customer_name?.trim() ?? "");
    setCustomerWhatsApp(found?.customer_whatsapp?.trim() ?? "");
    setCustomerSegment("NOVO");
    setConfirmOpenId(orderId);
    setError(null);
  }

  async function submitConfirmPayment(orderId: string) {
    setConfirming(orderId);
    setError(null);
    setErrorItems([]);
    setConfirmSuccessMsg(null);
    const found = orders.find((o) => o.id === orderId);
    const cats = categoriesInOrder(found);
    if (!cats.length) {
      setError("Pedido sem categorias para confirmação.");
      setConfirming(null);
      return;
    }
    const saleByCategory: Record<string, number> = {};
    let amount = 0;
    for (const cat of cats) {
      const n = Number(String(categoryAmounts[cat] ?? "").replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        setError(`Informe um valor válido para a categoria ${cat}`);
        setConfirming(null);
        return;
      }
      saleByCategory[cat] = n;
      amount += n;
    }
    if (amount <= 0) {
      setError("Informe ao menos um valor de venda por categoria.");
      setConfirming(null);
      return;
    }
    if (!customerName.trim()) {
      setError("Informe o nome do cliente");
      setConfirming(null);
      return;
    }
    const waDigits = customerWhatsApp.replace(/\D/g, "");
    if (waDigits.length < 10) {
      setError("Informe um WhatsApp com pelo menos 10 dígitos");
      setConfirming(null);
      return;
    }
    try {
      const res = await adminFetch(
        `/api/admin/orders/confirm/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
          body: JSON.stringify({
            saleAmount: amount,
            saleByCategory,
            customerName: customerName.trim(),
            customerWhatsApp: waDigits,
            customerSegment,
          }),
        }
      );
      const text = await res.text();
      let data: {
        error?: string;
        flaggedPending?: number;
        driveRename?: {
          errors?: Array<{ productId?: string; message?: string }>;
          details?: string;
        };
      } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) {
        const structuredErrors = Array.isArray(data.driveRename?.errors)
          ? data.driveRename!.errors
              .map((it) => ({
                productId: String(it.productId ?? "").trim(),
                message: String(it.message ?? "").trim(),
              }))
              .filter((it) => it.productId || it.message)
          : [];
        setErrorItems(
          structuredErrors.map((it) => ({
            productId: it.productId || "desconhecido",
            message: it.message || "Falha ao renomear no Drive",
          }))
        );
        const details =
          structuredErrors.length === 0 && typeof data.driveRename?.details === "string"
            ? ` Detalhes: ${data.driveRename.details}`
            : "";
        throw new Error((data.error ?? "Falha ao confirmar") + details);
      }

      const renameErrors = data.driveRename?.errors as
        | { productId: string; message: string }[]
        | undefined;
      const flaggedPending =
        typeof data.flaggedPending === "number" ? data.flaggedPending : 0;
      const conflictNote =
        flaggedPending > 0
          ? ` ${flaggedPending} outro(s) pedido(s) pendente(s) ficaram com aviso de peça esgotada (cliente deve refazer).`
          : "";
      if (renameErrors?.length) {
        setConfirmSuccessMsg(
          `Pedido confirmado. Atenção: ${renameErrors.length} renomeação(ões) no Drive falhou(aram). Verifique a API / logs.${conflictNote}`
        );
      } else {
        setConfirmSuccessMsg(
          `Pedido confirmado; nomes no Drive atualizados conforme o stock.${conflictNote}`
        );
      }
      setConfirmOpenId(null);
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setConfirming(null);
    }
  }

  const cancelConfirmEnabled =
    cancelPhrase.trim().toUpperCase() === "CANCELAR";

  async function cancelOrder(orderId: string) {
    if (!cancelConfirmEnabled) return;
    setCancelling(orderId);
    setError(null);
    setErrorItems([]);
    try {
      const res = await adminFetch(
        `/api/admin/orders/cancel/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
        }
      );
      const text = await res.text();
      let data: { error?: string } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        throw new Error("Resposta inválida do servidor.");
      }
      if (!res.ok) throw new Error(data.error ?? "Falha ao cancelar");
      setCancelOpenId(null);
      setCancelPhrase("");
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Pedidos pendentes
          </h1>
          <p className="text-sm text-stone-600">
            Confirme pagamento para baixar estoque; após confirmar, o sistema já
            aplica automaticamente os nomes atualizados no Drive.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDiegoOwnerUi && sellerFilterOptions.length > 0 && (
            <select
              value={sellerScope}
              onChange={(e) => setSellerScope(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
              aria-label="Filtrar pedidos por vendedor"
            >
              {sellerFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <Link
            href="/admin/historico"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Ver histórico
          </Link>
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "Carregando…" : "Atualizar pedidos"}
          </button>
        </div>
      </div>
      {confirmSuccessMsg && (
        <p className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          {confirmSuccessMsg}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{error}</p>
          {errorItems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errorItems.map((it, idx) => (
                <li key={`${it.productId}-${idx}`}>
                  <span className="font-semibold">Produto {it.productId}:</span>{" "}
                  {it.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {orders.length === 0 && !loading && (
        <p className="text-stone-600">Nenhum pedido pendente.</p>
      )}

      <ul className="space-y-6">
        {orders.map((order) => {
          const items = order.order_items ?? [];
          const categoryLines = aggregateByCategory(items);
          const bySize = groupItems(items);
          const waHref = waLinkFromDigits(order.customer_whatsapp);
          const driveLocked = isDriveConfirmLocked(order);
          const driveRetry = parseDriveRetryFromOrder(order);
          const stockConflict = parseOrderStockConflict(
            (order as OrderRow).stock_conflict
          );
          return (
            <li
              key={order.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold uppercase tracking-wide text-stone-800">
                    {`PEDIDO #${
                      order.display_number != null && order.display_number > 0
                        ? order.display_number
                        : "—"
                    }`}
                  </p>
                  <p className="font-mono text-xs text-stone-500">{order.id}</p>
                  {!driveLocked && driveRetry && (
                    <p className="mt-2 max-w-xl rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-xs text-violet-950">
                      Próxima confirmação:{" "}
                      <strong>
                        {driveRetry.failed_ids.length > 0
                          ? `${driveRetry.failed_ids.length} peça(s) no Drive`
                          : "só peças ainda por sincronizar"}
                      </strong>
                      {driveRetry.skip_ids.length > 0 && (
                        <>
                          {" "}
                          · {driveRetry.skip_ids.length} já renomeada(s) e ignorada(s)
                        </>
                      )}
                    </p>
                  )}
                  {stockConflict && (
                    <div className="mt-2 max-w-xl">
                      <StockConflictNotice
                        conflict={stockConflict}
                        variant="admin"
                      />
                    </div>
                  )}
                  {driveLocked && (
                    <div className="mt-2 space-y-2">
                      <p className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        Bloqueado por falha no Drive
                      </p>
                      <p className="max-w-xl text-xs text-amber-950/90">
                        O stock na base foi reposto, mas algumas fotos podem ter ficado renomeadas
                        no Drive. Use «Ver estado Drive» para saber quais peças corrigir. Só
                        desbloqueie e confirme de novo quando tudo estiver alinhado (ou use em
                        Configuração «Alinhar Drive ao stock»).
                      </p>
                      <button
                        type="button"
                        onClick={() => void loadDriveDiagnostic(order.id)}
                        className="mt-2 rounded-lg border border-amber-500 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
                      >
                        Ver estado Drive
                      </button>
                      {(() => {
                        const diag = driveDiagnosticByOrder[order.id];
                        if (!diag) return null;
                        if (diag.loading) {
                          return (
                            <p className="mt-2 text-xs text-amber-900">
                              A comparar base e Drive…
                            </p>
                          );
                        }
                        if (diag.error) {
                          return (
                            <p className="mt-2 text-xs text-red-800">{diag.error}</p>
                          );
                        }
                        if (!diag.lines?.length) return null;
                        return (
                          <div className="mt-3 max-w-2xl rounded-lg border border-amber-300/80 bg-white/90 p-3 text-xs text-stone-800">
                            <p className="font-semibold text-amber-950">
                              Diagnóstico ({diag.lines.length} produto
                              {diag.lines.length === 1 ? "" : "s"})
                            </p>
                            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                              {diag.lines.map((line) => (
                                <li
                                  key={line.product_id}
                                  className="rounded border border-stone-200 bg-stone-50/80 px-2 py-1.5"
                                >
                                  <p className="font-medium">
                                    {line.brand} {line.color}{" "}
                                    <span className="font-normal text-stone-500">
                                      · {line.qty_in_order} no pedido · stock BD{" "}
                                      {line.db_stock}
                                    </span>
                                  </p>
                                  <p
                                    className={
                                      line.status === "synced"
                                        ? "text-emerald-800"
                                        : line.status === "drive_ahead"
                                          ? "text-amber-900"
                                          : "text-red-800"
                                    }
                                  >
                                    {DRIVE_STATUS_LABEL[line.status]}
                                  </p>
                                  <p className="text-stone-600">{line.hint}</p>
                                  {line.drive_current_name && (
                                    <p className="mt-0.5 font-mono text-[10px] text-stone-500">
                                      Drive: {line.drive_current_name}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[11px] text-stone-600">
                              <Link
                                href="/admin/configuracao"
                                className="font-medium text-violet-800 underline"
                              >
                                Configuração
                              </Link>
                              {" — "}
                              teste OAuth e «Alinhar Drive ao stock» depois de corrigir IDs em
                              falta.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {order.customer_name && (
                    <p className="mt-1 text-sm text-stone-800">
                      <span className="text-stone-500">Cliente: </span>
                      {order.customer_name}
                    </p>
                  )}
                  {order.requested_seller_name && (
                    <p className="text-sm text-stone-700">
                      <span className="text-stone-500">Vendedor escolhido: </span>
                      {order.requested_seller_name}
                    </p>
                  )}
                  {order.public_token ? (
                    <p className="mt-1 text-xs">
                      <Link
                        href={`/recibo/${order.public_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-violet-800 underline hover:text-violet-900"
                      >
                        Abrir recibo do cliente
                      </Link>
                    </p>
                  ) : null}
                  <p className="text-xs text-stone-400">
                    {new Date(order.created_at).toLocaleString("pt-BR")}
                  </p>
                  {categoryLines.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm italic text-stone-700">
                      {categoryLines.map((line) => (
                        <li key={`${order.id}:${line.label}`}>
                          {`x${line.qty} ${line.label}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {order.customer_note && (
                    <p className="mt-2 text-sm text-stone-700">
                      <span className="text-stone-500">CEP: </span>
                      {order.customer_note}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrders((prev) => ({
                        ...prev,
                        [order.id]: !prev[order.id],
                      }))
                    }
                    className="mt-2 text-sm font-medium text-violet-800 underline hover:text-violet-900"
                  >
                    {expandedOrders[order.id]
                      ? "Ocultar pedido completo"
                      : "Ver pedido completo"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {waHref ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir conversa no WhatsApp"
                      aria-label="Abrir conversa no WhatsApp"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white shadow hover:bg-[#20bd5a]"
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                        <path
                          fill="currentColor"
                          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"
                        />
                      </svg>
                    </a>
                  ) : (
                    <span
                      title="Cliente não informou WhatsApp no pedido"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-stone-200 text-stone-500"
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                        <path
                          fill="currentColor"
                          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"
                        />
                      </svg>
                    </span>
                  )}
                  {driveLocked ? (
                    <button
                      type="button"
                      disabled={
                        unlocking === order.id || !!confirming || !!cancelling
                      }
                      onClick={() => void unlockDriveConfirmLock(order.id)}
                      className="rounded-xl border border-amber-400 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
                    >
                      {unlocking === order.id
                        ? "A desbloquear…"
                        : "Remover bloqueio e tentar de novo"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={
                      confirming === order.id ||
                      !!cancelling ||
                      driveLocked ||
                      !!unlocking
                    }
                    onClick={() => openConfirmModal(order.id)}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Confirmar pagamento
                  </button>
                  <button
                    type="button"
                    disabled={!!confirming || !!cancelling || !!unlocking}
                    onClick={() => {
                      setCancelOpenId((id) =>
                        id === order.id ? null : order.id
                      );
                      setCancelPhrase("");
                    }}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {cancelOpenId === order.id ? "Fechar" : "Cancelar pedido"}
                  </button>
                </div>
              </div>

              {confirmOpenId === order.id && (
                <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-4 text-sm text-stone-900">
                  <p className="font-semibold text-violet-950">
                    Confirmar venda e baixar estoque
                  </p>
                  <p className="mt-1 text-violet-900/90">
                    Os dados abaixo entram nas métricas e disparam a renomeação das fotos no Drive.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {categoriesInOrder(order).map((cat) => (
                      <label
                        key={`cat-amount-${order.id}-${cat}`}
                        className="block text-xs font-medium text-stone-600"
                      >
                        {`Preço por peça — ${cat} (R$)`}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={categoryAmounts[cat] ?? ""}
                          onChange={(e) =>
                            setCategoryAmounts((prev) => ({
                              ...prev,
                              [cat]: e.target.value,
                            }))
                          }
                          placeholder="ex.: 27,00"
                          className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                        />
                      </label>
                    ))}
                    <label className="block text-xs font-medium text-stone-600">
                      Nome do cliente
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-600 sm:col-span-2">
                      WhatsApp
                      <input
                        type="tel"
                        value={customerWhatsApp}
                        onChange={(e) => setCustomerWhatsApp(e.target.value)}
                        placeholder="5511999999999"
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-900"
                      />
                    </label>
                  </div>
                  <fieldset className="mt-3">
                    <legend className="text-xs font-medium text-stone-600">
                      Cliente
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-${order.id}`}
                          checked={customerSegment === "NOVO"}
                          onChange={() => setCustomerSegment("NOVO")}
                        />
                        Novo
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`seg-${order.id}`}
                          checked={customerSegment === "ANTIGO"}
                          onChange={() => setCustomerSegment("ANTIGO")}
                        />
                        Antigo
                      </label>
                    </div>
                  </fieldset>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={confirming === order.id}
                      onClick={() => submitConfirmPayment(order.id)}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {confirming === order.id ? "Confirmando…" : "Registrar e confirmar"}
                    </button>
                    <button
                      type="button"
                      disabled={!!confirming}
                      onClick={() => setConfirmOpenId(null)}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {cancelOpenId === order.id && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-950">
                  <p className="font-medium">Cancelar este pedido?</p>
                  <p className="mt-1 text-red-900/90">
                    O pedido ficará como cancelado (aparece em Clientes → Carrinhos
                    abandonados para remarketing). O recibo do cliente mostra que foi
                    cancelado. Esta ação não pode ser desfeita.
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-red-800">
                    Confirmação (2.º passo): digite{" "}
                    <span className="font-mono">CANCELAR</span>
                  </p>
                  <input
                    type="text"
                    value={cancelPhrase}
                    onChange={(e) => setCancelPhrase(e.target.value)}
                    autoComplete="off"
                    placeholder="Digite CANCELAR"
                    className="mt-2 w-full max-w-xs rounded-lg border border-red-300 bg-white px-3 py-2 font-mono text-sm text-stone-900"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        !cancelConfirmEnabled ||
                        cancelling === order.id ||
                        !!confirming
                      }
                      onClick={() => cancelOrder(order.id)}
                      className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cancelling === order.id
                        ? "Cancelando…"
                        : "Confirmar cancelamento"}
                    </button>
                    <button
                      type="button"
                      disabled={!!cancelling}
                      onClick={() => {
                        setCancelOpenId(null);
                        setCancelPhrase("");
                      }}
                      className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-800 hover:bg-stone-50"
                    >
                      Desistir
                    </button>
                  </div>
                </div>
              )}

              {expandedOrders[order.id] &&
                SIZE_ORDER.map((size) => {
                  const list = bySize.get(size) ?? [];
                  if (!list.length) return null;
                  return (
                    <div key={size} className="mb-4 last:mb-0">
                      <h3 className="mb-2 text-sm font-semibold text-stone-800">
                        Tamanho {size}
                      </h3>
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {list.map((it) => (
                          <li
                            key={it.id}
                            className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-2"
                          >
                            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={adminThumbSrc(it)}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                            <div className="min-w-0 text-sm">
                              <p className="font-medium text-stone-900">
                                {it.snapshot_brand} — {it.snapshot_color}{" "}
                                <span className="text-stone-500">×{it.quantity}</span>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
