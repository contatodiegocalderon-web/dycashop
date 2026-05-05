"use client";

import { useCallback, useEffect, useState } from "react";

export function CatalogPublicLink() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const catalogUrl = origin ? `${origin}/` : "";

  const copy = useCallback(async () => {
    if (!catalogUrl) return;
    try {
      await navigator.clipboard.writeText(catalogUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [catalogUrl]);

  return (
    <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 p-5 shadow-inner">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/70">
        Link do catálogo (clientes)
      </p>
      <p className="mt-1 text-sm text-emerald-950/85">
        Partilhe só esta página — não inclui a área administrativa. Os clientes usam o carrinho e o
        WhatsApp sem ver o painel admin.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-left text-sm font-medium text-emerald-950">
          {catalogUrl || "…"}
        </code>
        <button
          type="button"
          onClick={copy}
          disabled={!catalogUrl}
          className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-3 text-xs text-emerald-900/65">
        Área administrativa:{" "}
        <span className="font-mono text-[11px]">{origin ? `${origin}/admin/login` : "…/admin/login"}</span>
      </p>
    </div>
  );
}
