"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ADMIN_KEY_STORAGE = "admin_api_key";

export type StaffSession = {
  email: string;
  role: "owner" | "seller";
  /** Sessão derivada da chave ADMIN_API_SECRET (sem conta staff_users). */
  fromApiKey?: boolean;
};

type AdminAuthContextValue = {
  session: StaffSession | null;
  ready: boolean;
  logout: () => void;
  refreshSession: () => Promise<void>;
  /** fetch com `credentials: 'include'` (cookie de sessão). */
  adminFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  /** Compat: cabeçalhos JSON (a sessão é o cookie, não chave no storage). */
  adminHeaders: HeadersInit;
  isOwner: boolean;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth deve ser usado dentro de AdminAuthProvider");
  }
  return ctx;
}

function AdminChrome({ children }: { children: ReactNode }) {
  const { logout, session, isOwner } = useAdminAuth();
  const pathname = usePathname();

  const allNav = useMemo(
    () =>
      [
        { href: "/admin", label: "Início", exact: true, ownerOnly: false },
        { href: "/admin/pedidos", label: "Pedidos", exact: false, ownerOnly: false },
        { href: "/admin/historico", label: "Histórico", exact: false, ownerOnly: false },
        { href: "/admin/metricas", label: "Métricas", exact: false, ownerOnly: false },
        { href: "/admin/categorias", label: "Categorias", exact: false, ownerOnly: false },
        { href: "/admin/clientes", label: "Clientes", exact: false, ownerOnly: false },
        {
          href: "/admin/configuracao",
          label: "Catálogo & Drive",
          exact: false,
          ownerOnly: true,
        },
      ] as const,
    []
  );

  const nav = allNav.filter((item) => !item.ownerOnly || isOwner);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-stone-200/80">
      <header className="sticky top-0 z-40 border-b border-stone-800/40 bg-stone-900 text-stone-50 shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/admin"
              className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent drop-shadow-sm"
            >
              Admin
            </Link>
            <nav className="flex flex-wrap gap-1">
              {nav.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "text-stone-300 hover:bg-stone-800 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {session && (
              <span className="hidden text-xs text-stone-500 sm:inline">
                {session.email}
                {session.fromApiKey ? " · chave API" : ""}
              </span>
            )}
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
            >
              Ver loja
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-stone-600 px-3 py-1.5 text-sm font-medium text-stone-200 hover:bg-stone-800"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [ready, setReady] = useState(false);

  const adminFetch = useCallback((input: RequestInfo, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    let legacy = "";
    try {
      legacy = sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
    } catch {
      /* ignore */
    }
    if (legacy.trim()) {
      h.set("x-admin-key", legacy.trim());
    }
    const body = init?.body;
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData;
    if (!h.has("Content-Type") && body != null && !isFormData) {
      h.set("Content-Type", "application/json");
    }
    return fetch(input, {
      ...init,
      credentials: "include",
      headers: h,
    });
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const r = await adminFetch("/api/auth/staff/me");
      if (r.ok) {
        const j = (await r.json()) as {
          user: {
            email: string;
            role: "owner" | "seller";
            fromApiKey?: boolean;
          } | null;
        };
        if (j.user?.email) {
          setSession({
            email: j.user.email,
            role: j.user.role,
            fromApiKey: j.user.fromApiKey,
          });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setSession(null);
  }, [adminFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSession();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await adminFetch("/api/auth/staff/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setSession(null);
    router.push("/admin/login");
  }, [adminFetch, router]);

  const adminHeaders = useMemo((): HeadersInit => {
    const h: Record<string, string> = {};
    return h;
  }, []);

  const isOwner = session?.role === "owner" || session?.fromApiKey === true;

  const value = useMemo(
    () => ({
      session,
      ready,
      logout,
      refreshSession,
      adminFetch,
      adminHeaders,
      isOwner,
    }),
    [session, ready, logout, refreshSession, adminFetch, adminHeaders, isOwner]
  );

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (!ready) return;
    if (isLogin) return;
    if (!session) {
      router.replace("/admin/login");
    }
  }, [ready, isLogin, session, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-600">
        <p className="text-sm">A carregar…</p>
      </div>
    );
  }

  if (isLogin) {
    return (
      <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-600">
        <p className="text-sm">A redirecionar…</p>
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={value}>
      <AdminChrome>{children}</AdminChrome>
    </AdminAuthContext.Provider>
  );
}
