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

  const importControls = isOwner ? (
    <>
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
      {importMsg && (
        <p className="w-full text-xs text-amber-800">{importMsg}</p>
      )}
    </>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white [text-shadow:1px_0_0_rgb(124_58_237),-1px_0_0_rgb(124_58_237),0_1px_0_rgb(124_58_237),0_-1px_0_rgb(124_58_237)]">
          CRM — Clientes
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">
          Funil de vendas: carrinhos abandonados e pedidos em aberto (atacado 5+ peças /
          varejo), depois clientes confirmados por recência (&lt;30d, 30–59d, 60+d) com
          perfil lojista, revendedor ou uso próprio.
        </p>
        <Link
          href="/admin/metricas"
          className="mt-4 inline-block text-sm font-medium text-violet-800 underline hover:text-violet-900"
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
