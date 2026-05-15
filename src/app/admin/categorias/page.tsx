"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/admin-auth";
import {
  DISPLAY_ORDER_DEFAULT_SENTINEL,
  sortCategoryLabelsForCatalog,
} from "@/lib/catalog-categories";
import type { WholesaleTier } from "@/lib/category-showcase";

type CostRow = {
  category_label: string;
  cost_per_piece: number;
};

type ShowcaseRow = {
  category_label: string;
  video_url: string | null;
  video_poster_url: string | null;
  wholesale_tiers: WholesaleTier[];
  home_grid_cover_image_url: string | null;
  catalog_cover_image_url: string | null;
  display_order: number | null;
};

type CoverKind = "home_grid" | "category_page";

function tiersToText(tiers: WholesaleTier[]) {
  return tiers
    .map((t) => `${t.minQty}-${t.maxQty == null ? "+" : t.maxQty}=${t.price}`)
    .join("\n");
}

function parseTierText(input: string): WholesaleTier[] {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tiers: WholesaleTier[] = [];
  for (const line of lines) {
    const [range, priceRaw] = line.split("=");
    if (!range || !priceRaw) throw new Error(`Faixa inválida: "${line}"`);
    const [minRaw, maxRaw] = range.split("-");
    const minQty = Number(minRaw);
    const maxQty = maxRaw === "+" ? null : Number(maxRaw);
    const price = Number(priceRaw.replace(",", "."));
    if (!Number.isFinite(minQty) || minQty < 1) {
      throw new Error(`Quantidade mínima inválida em "${line}"`);
    }
    if (maxQty != null && (!Number.isFinite(maxQty) || maxQty < minQty)) {
      throw new Error(`Quantidade máxima inválida em "${line}"`);
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Preço inválido em "${line}"`);
    }
    tiers.push({ minQty, maxQty, price });
  }
  if (tiers.length === 0) {
    throw new Error("Informe ao menos uma faixa de atacado.");
  }
  return tiers;
}

type AdminTab = "operacao" | "capas";

export default function AdminCategoriasPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("operacao");

  const [categories, setCategories] = useState<string[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, string>>({});
  const [videoEdits, setVideoEdits] = useState<Record<string, string>>({});
  const [posterEdits, setPosterEdits] = useState<Record<string, string>>({});
  const [tiersEdits, setTiersEdits] = useState<Record<string, string>>({});
  const [gridCoverEdits, setGridCoverEdits] = useState<Record<string, string>>({});
  const [categoryCoverEdits, setCategoryCoverEdits] = useState<
    Record<string, string>
  >({});
  const [uploadBusy, setUploadBusy] = useState<Record<string, boolean>>({});
  const [showcaseRows, setShowcaseRows] = useState<ShowcaseRow[]>([]);
  const [reorderBusy, setReorderBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const [costRes, showcaseRes] = await Promise.all([
        adminFetch("/api/admin/category-costs"),
        adminFetch("/api/admin/category-showcase"),
      ]);
      const costJson = await costRes.json();
      const showcaseJson = await showcaseRes.json();
      if (!costRes.ok) throw new Error(costJson.error ?? "Falha ao carregar custos");
      if (!showcaseRes.ok) {
        throw new Error(showcaseJson.error ?? "Falha ao carregar configurações");
      }

      const costRows = (costJson.rows ?? []) as CostRow[];
      const showcaseRowsParsed = (showcaseJson.rows ?? []) as ShowcaseRow[];
      setShowcaseRows(showcaseRowsParsed);

      const allLabels = Array.from(
        new Set([
          ...costRows.map((r) => r.category_label),
          ...showcaseRowsParsed.map((r) => r.category_label),
        ])
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      const orderVals = new Map<string, number | null | undefined>();
      for (const lab of allLabels) {
        const sh = showcaseRowsParsed.find((r) => r.category_label === lab);
        orderVals.set(
          lab,
          sh?.display_order != null &&
            sh.display_order !== DISPLAY_ORDER_DEFAULT_SENTINEL
            ? sh.display_order
            : null
        );
      }
      const sortedLabels = sortCategoryLabelsForCatalog(allLabels, orderVals);

      const costMap: Record<string, string> = {};
      const videoMap: Record<string, string> = {};
      const posterMap: Record<string, string> = {};
      const tiersMap: Record<string, string> = {};
      const gridMap: Record<string, string> = {};
      const catCoverMap: Record<string, string> = {};
      for (const label of sortedLabels) {
        const cost = costRows.find((r) => r.category_label === label)?.cost_per_piece ?? 0;
        const showcase = showcaseRowsParsed.find((r) => r.category_label === label);
        costMap[label] = String(cost);
        videoMap[label] = showcase?.video_url ?? "";
        posterMap[label] = showcase?.video_poster_url ?? "";
        tiersMap[label] = tiersToText(showcase?.wholesale_tiers ?? []);
        gridMap[label] = showcase?.home_grid_cover_image_url ?? "";
        catCoverMap[label] = showcase?.catalog_cover_image_url ?? "";
      }

      setCategories(sortedLabels);
      setCostEdits(costMap);
      setVideoEdits(videoMap);
      setPosterEdits(posterMap);
      setTiersEdits(tiersMap);
      setGridCoverEdits(gridMap);
      setCategoryCoverEdits(catCoverMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveAll() {
    if (!isOwner) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const costEntries = categories.map((category_label) => ({
        category_label,
        cost_per_piece: Number(String(costEdits[category_label] ?? "0").replace(",", ".")),
      }));
      const showcaseEntries = categories.map((category_label) => ({
        category_label,
        video_url: (videoEdits[category_label] ?? "").trim() || null,
        video_poster_url: (posterEdits[category_label] ?? "").trim() || null,
        wholesale_tiers: parseTierText(tiersEdits[category_label] ?? ""),
        home_grid_cover_image_url:
          (gridCoverEdits[category_label] ?? "").trim() || null,
        catalog_cover_image_url:
          (categoryCoverEdits[category_label] ?? "").trim() || null,
        display_order:
          showcaseRows.find((r) => r.category_label === category_label)?.display_order ??
          DISPLAY_ORDER_DEFAULT_SENTINEL,
      }));

      const [costRes, showcaseRes] = await Promise.all([
        adminFetch("/api/admin/category-costs", {
          method: "PUT",
          body: JSON.stringify({ entries: costEntries }),
        }),
        adminFetch("/api/admin/category-showcase", {
          method: "PUT",
          body: JSON.stringify({ entries: showcaseEntries }),
        }),
      ]);
      const costJson = await costRes.json();
      const showcaseJson = await showcaseRes.json();
      if (!costRes.ok) throw new Error(costJson.error ?? "Falha ao salvar custos");
      if (!showcaseRes.ok) {
        throw new Error(showcaseJson.error ?? "Falha ao salvar categorias");
      }
      setOk("Categorias atualizadas com sucesso.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  function busyKey(label: string, kind: CoverKind) {
    return `${kind}:${label}`;
  }

  async function uploadCover(label: string, file: File, kind: CoverKind) {
    if (!isOwner) return;
    const key = busyKey(label, kind);
    setUploadBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.append("category_label", label);
      fd.append("cover_kind", kind);
      fd.append("file", file);
      const res = await adminFetch("/api/admin/category-cover-upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      if (data.url) {
        if (kind === "home_grid") {
          setGridCoverEdits((prev) => ({ ...prev, [label]: data.url! }));
        } else {
          setCategoryCoverEdits((prev) => ({ ...prev, [label]: data.url! }));
        }
      }
      setOk(
        kind === "home_grid"
          ? "Imagem do cartão na página inicial atualizada."
          : "Banner da página da categoria atualizado."
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no envio");
    } finally {
      setUploadBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function reorderCategory(label: string, direction: "up" | "down") {
    if (!isOwner) return;
    setReorderBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await adminFetch("/api/admin/category-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_label: label, direction }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao reordenar");
      setOk("Ordem atualizada na vitrine.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setReorderBusy(false);
    }
  }

  async function removeCover(label: string, kind: CoverKind) {
    if (!isOwner) return;
    const key = busyKey(label, kind);
    setUploadBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    setOk(null);
    try {
      const q = new URLSearchParams({
        category_label: label,
        cover_kind: kind,
      });
      const res = await adminFetch(
        `/api/admin/category-cover-upload?${q.toString()}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover");
      if (kind === "home_grid") {
        setGridCoverEdits((prev) => ({ ...prev, [label]: "" }));
      } else {
        setCategoryCoverEdits((prev) => ({ ...prev, [label]: "" }));
      }
      setOk(
        kind === "home_grid"
          ? "Imagem da grelha removida."
          : "Banner da categoria removido."
      );
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setUploadBusy((b) => ({ ...b, [key]: false }));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
            Categorias
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Custos, vídeo, atacado, ordem na home e capa da vitrine.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? "A carregar…" : "Atualizar"}
        </button>
      </div>

      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1 border-b border-stone-200">
          <button
            type="button"
            onClick={() => setTab("operacao")}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === "operacao"
                ? "border-b-2 border-violet-600 text-violet-800"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Operação & vídeo
          </button>
          <button
            type="button"
            onClick={() => setTab("capas")}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === "capas"
                ? "border-b-2 border-violet-600 text-violet-800"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Capas na página inicial
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          {ok}
        </div>
      )}

      {categories.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ainda não há categorias importadas no catálogo.
        </p>
      ) : tab === "operacao" ? (
        <>
          <div className="space-y-4">
            {categories.map((label) => (
              <section
                key={label}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-stone-900">{label}</h2>
                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Subir na lista da home"
                        disabled={reorderBusy}
                        onClick={() => void reorderCategory(label, "up")}
                        className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Descer na lista da home"
                        disabled={reorderBusy}
                        onClick={() => void reorderCategory(label, "down")}
                        className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-sm text-stone-700">
                    Custo por peça (R$)
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!isOwner}
                      value={costEdits[label] ?? ""}
                      onChange={(e) =>
                        setCostEdits((prev) => ({ ...prev, [label]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                    />
                  </label>
                  <label className="text-sm text-stone-700">
                    URL do vídeo
                    <input
                      type="url"
                      disabled={!isOwner}
                      value={videoEdits[label] ?? ""}
                      onChange={(e) =>
                        setVideoEdits((prev) => ({ ...prev, [label]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                      placeholder="Link do YouTube ou ficheiro .mp4…"
                    />
                  </label>
                  <label className="text-sm text-stone-700">
                    URL do poster (opcional)
                    <input
                      type="url"
                      disabled={!isOwner}
                      value={posterEdits[label] ?? ""}
                      onChange={(e) =>
                        setPosterEdits((prev) => ({ ...prev, [label]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 disabled:bg-stone-100"
                      placeholder="https://..."
                    />
                  </label>
                </div>

                <label className="mt-3 block text-sm text-stone-700">
                  Tabela atacado (uma linha por faixa no formato `min-max=preço` e `min-+=preço`)
                  <textarea
                    rows={4}
                    disabled={!isOwner}
                    value={tiersEdits[label] ?? ""}
                    onChange={(e) =>
                      setTiersEdits((prev) => ({ ...prev, [label]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs text-stone-900 disabled:bg-stone-100"
                  />
                </label>
              </section>
            ))}
          </div>

          {isOwner && (
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="mt-6 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "A guardar…" : "Guardar categorias"}
            </button>
          )}
        </>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50/80 p-5 shadow-sm">
            <p className="text-sm font-semibold text-stone-900">Duas imagens por categoria</p>
            <p className="text-sm text-stone-600">
              <strong>1) Grelha da página inicial</strong> — fundo do cartão (onde antes entrava uma
              foto automática de produto). <strong>2) Página da categoria</strong> — faixa larga no
              topo ao abrir a pasta.
            </p>
            <p className="text-sm text-stone-600">
              Horizontal recomendado; largura máx. 1920 px. JPEG, PNG ou WebP até 6 MB. Se a base
              ainda não tiver a coluna nova, execute{" "}
              <code className="rounded bg-stone-200 px-1 text-xs">
                supabase/migration_home_grid_cover_split.sql
              </code>{" "}
              no Supabase.
            </p>
          </div>
          {categories.map((label) => {
            const gridUrl = (gridCoverEdits[label] ?? "").trim();
            const catUrl = (categoryCoverEdits[label] ?? "").trim();
            const busyGrid = uploadBusy[busyKey(label, "home_grid")] ?? false;
            const busyCat = uploadBusy[busyKey(label, "category_page")] ?? false;
            return (
              <section
                key={label}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-stone-900">{label}</h2>

                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Página inicial — cartão na grelha
                    </p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="relative aspect-[16/11] w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:max-w-sm">
                        {gridUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- URL dinâmica Storage
                          <img
                            src={gridUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-[120px] items-center justify-center px-3 text-center text-xs text-stone-500">
                            Sem imagem — usa foto automática de um produto.
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <label className="text-sm font-medium text-stone-700">
                          Subir imagem
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={!isOwner || busyGrid}
                            className="mt-1 block w-full max-w-sm text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-800"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f && isOwner) void uploadCover(label, f, "home_grid");
                            }}
                          />
                        </label>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={busyGrid || !gridUrl}
                            onClick={() => void removeCover(label, "home_grid")}
                            className="w-fit rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                          >
                            {busyGrid ? "A processar…" : "Remover"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Página da categoria — banner no topo
                    </p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:max-w-sm">
                        {catUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={catUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-[100px] items-center justify-center px-3 text-center text-xs text-stone-500">
                            Sem banner — só conteúdo e filtros abaixo.
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <label className="text-sm font-medium text-stone-700">
                          Subir imagem
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={!isOwner || busyCat}
                            className="mt-1 block w-full max-w-sm text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-800"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f && isOwner) void uploadCover(label, f, "category_page");
                            }}
                          />
                        </label>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={busyCat || !catUrl}
                            onClick={() => void removeCover(label, "category_page")}
                            className="w-fit rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                          >
                            {busyCat ? "A processar…" : "Remover"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
