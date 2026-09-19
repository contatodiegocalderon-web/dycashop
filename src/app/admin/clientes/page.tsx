"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CrmFunnelView } from "@/components/admin/crm-funnel-view";
import { useAdminAuth } from "@/contexts/admin-auth";

type SellerFilterOption = { value: string; label: string };

export default function AdminClientesPage() {
  const { adminFetch, isOwner } = useAdminAuth();
  const [sellerScope, setSellerScope] = useState("all");
  const [sellerFilterOptions, setSellerFilterOptions] = useState<SellerFilterOption[]>(
    []
  );
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) {
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
  }, [adminFetch, isOwner]);

  const onImportLegacyFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportMsg(null);
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!/\.xlsx?$/i.test(f.name)) {
        setImportMsg("Use um ficheiro Excel (.xlsx).");
        return;
      }
      setImporting(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await adminFetch("/api/admin/clients/import-legacy", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha na importação");
        const s = data.stats as {
          registered?: number;
          abandoned?: number;
          skippedExisting?: number;
        };
        setImportMsg(
          `Importação: ${s.registered ?? 0} registrado(s), ${s.abandoned ?? 0} abandonado(s). Ignorados (já no site): ${s.skippedExisting ?? 0}.`
        );
      } catch (err) {
        setImportMsg(err instanceof Error ? err.message : "Erro na importação");
      } finally {
        setImporting(false);
      }
    },
    [adminFetch]
  );

  const onExportLeads = useCallback(async () => {
    setExportMsg(null);
    setExporting(true);
    try {
      const q = new URLSearchParams();
      if (isOwner && sellerScope && sellerScope !== "all") {
        q.set("sellerScope", sellerScope);
      }
      const suffix = q.toString() ? `?${q.toString()}` : "";
      const res = await adminFetch(`/api/admin/clients/export${suffix}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Falha ao exportar");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `crm-leads-${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg("Excel baixado com sucesso.");
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : "Erro na exportação");
    } finally {
      setExporting(false);
    }
  }, [adminFetch, isOwner, sellerScope]);

  const importControls = (
    <>
      <button
        type="button"
        onClick={() => void onExportLeads()}
        disabled={exporting}
        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
      >
        {exporting ? "A exportar…" : "Exportar Excel"}
      </button>
      {isOwner ? (
        <label className="cursor-pointer rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100">
          {importing ? "A importar…" : "Importar Excel"}
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={importing}
            onChange={(e) => void onImportLegacyFile(e)}
          />
        </label>
      ) : null}
      {(importMsg || exportMsg) && (
        <p className="w-full text-xs text-amber-800">
          {[exportMsg, importMsg].filter(Boolean).join(" · ")}
        </p>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
          Reativação
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Tarefas do dia: abrir o WhatsApp, enviar a mensagem da fase e marcar como
          feito. Sem disparo em massa — um lead de cada vez.
        </p>
        <Link
          href="/admin/metricas"
          className="mt-3 inline-block text-sm font-medium text-violet-800 underline hover:text-violet-900"
        >
          ← Métricas
        </Link>
      </div>

      <CrmFunnelView
        isOwner={isOwner}
        sellerScope={sellerScope}
        onSellerScopeChange={setSellerScope}
        sellerFilterOptions={sellerFilterOptions}
        importControls={importControls}
      />
    </div>
  );
}
