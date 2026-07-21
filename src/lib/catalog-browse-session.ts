import type { ProductSize } from "@/types";
import type { WizardGuidedFilter } from "@/lib/catalog-guided-wizard";

export type CatalogBrowseSnapshot = {
  pathname: string;
  search: string;
  scrollY: number;
  size: "" | ProductSize;
  brand: string;
  color: string;
  categoryFree: string;
  wizardDone: boolean;
  wizardGuidedFilter: WizardGuidedFilter | null;
};

const SNAPSHOT_KEY = "dycashop.catalogBrowseSnapshot";
const RESTORE_KEY = "dycashop.catalogBrowseRestore";

function readSnapshotRaw(): CatalogBrowseSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogBrowseSnapshot;
    if (!parsed?.pathname) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: CatalogBrowseSnapshot) {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / modo privado */
  }
}

/** Guarda filtros + scroll da sessão de compra (para voltar do carrinho). */
export function saveCatalogBrowseSnapshot(snapshot: CatalogBrowseSnapshot) {
  if (
    !snapshot.pathname ||
    snapshot.pathname.startsWith("/carrinho") ||
    snapshot.pathname.startsWith("/admin")
  ) {
    return;
  }
  writeSnapshot(snapshot);
}

export function updateCatalogBrowseScroll(scrollY: number) {
  const prev = readSnapshotRaw();
  if (!prev) return;
  writeSnapshot({ ...prev, scrollY: Math.max(0, scrollY) });
}

/** Marca que a próxima visita ao catálogo deve restaurar filtros e scroll. */
export function markCatalogBrowseRestore() {
  try {
    sessionStorage.setItem(RESTORE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isCatalogBrowseRestorePending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(RESTORE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearCatalogBrowseRestore() {
  try {
    sessionStorage.removeItem(RESTORE_KEY);
  } catch {
    /* ignore */
  }
}

function pathsMatch(
  snap: CatalogBrowseSnapshot,
  pathname: string,
  search: string
): boolean {
  return snap.pathname === pathname && snap.search === search;
}

/** Lê snapshot só se o cliente voltou do carrinho e a rota coincide. */
export function readCatalogBrowseRestore(
  pathname: string,
  search = ""
): CatalogBrowseSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    if (sessionStorage.getItem(RESTORE_KEY) !== "1") return null;
  } catch {
    return null;
  }
  const snap = readSnapshotRaw();
  if (!snap || !pathsMatch(snap, pathname, search)) return null;
  return snap;
}

export function getCatalogReturnUrl(fallback = "/"): string {
  const snap = readSnapshotRaw();
  if (snap?.pathname) {
    return snap.search ? `${snap.pathname}${snap.search}` : snap.pathname;
  }
  if (typeof window === "undefined") return fallback;
  try {
    return sessionStorage.getItem("dycashop.catalogReturnUrl") || fallback;
  } catch {
    return fallback;
  }
}

/** Fallback: guarda só a URL quando não há snapshot completo ainda. */
export function rememberCatalogReturnUrl(pathname: string, search = "") {
  if (
    !pathname ||
    pathname.startsWith("/carrinho") ||
    pathname.startsWith("/admin")
  ) {
    return;
  }
  const url = search ? `${pathname}${search}` : pathname;
  try {
    sessionStorage.setItem("dycashop.catalogReturnUrl", url);
  } catch {
    /* ignore */
  }
}
