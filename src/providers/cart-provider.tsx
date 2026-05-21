"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartLine, Product } from "@/types";

export const CART_STORAGE_KEY = "streetwear-cart-v1";

type CartContextValue = {
  lines: CartLine[];
  hydrated: boolean;
  addProduct: (product: Product, qty?: number) => void;
  setLineQuantity: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  /** Alinha o carrinho ao catálogo/stock actual (remove esgotados, ajusta quantidades). */
  reconcileWithCatalog: () => Promise<string | null>;
};

const CartContext = createContext<CartContextValue | null>(null);

function productToCartProduct(
  p: Product
): CartLine["product"] {
  return {
    drive_image_url: p.drive_image_url,
    original_file_name: p.original_file_name,
    category: p.category ?? null,
    brand: p.brand,
    color: p.color,
    size: p.size,
    stock: p.stock,
    sku: p.sku,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setLines(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, hydrated]);

  const addProduct = useCallback((product: Product, qty = 1) => {
    setLines((prev) => {
      const cp = productToCartProduct(product);
      const idx = prev.findIndex((l) => l.productId === product.id);
      const nextQty =
        idx >= 0
          ? Math.min(prev[idx].quantity + qty, product.stock)
          : Math.min(qty, product.stock);
      if (nextQty < 1) return prev;

      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          quantity: nextQty,
          product: { ...cp, stock: product.stock },
        };
        return copy;
      }
      return [
        ...prev,
        {
          productId: product.id,
          driveFileId: product.drive_file_id,
          quantity: nextQty,
          product: cp,
        },
      ];
    });
  }, []);

  const setLineQuantity = useCallback((productId: string, qty: number) => {
    setLines((prev) => {
      const line = prev.find((l) => l.productId === productId);
      if (!line) return prev;
      const max = line.product.stock;
      const q = Math.max(0, Math.min(qty, max));
      if (q === 0) return prev.filter((l) => l.productId !== productId);
      return prev.map((l) =>
        l.productId === productId ? { ...l, quantity: q } : l
      );
    });
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const reconcileWithCatalog = useCallback(async (): Promise<string | null> => {
    const current = lines;
    if (!current.length) return null;

    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: current.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        lines?: Array<
          | {
              productId: string;
              status: "ok";
              quantity: number;
              available: number;
            }
          | {
              productId: string;
              status: "removed";
              reason: string;
              previousQuantity: number;
            }
          | {
              productId: string;
              status: "adjusted";
              quantity: number;
              previousQuantity: number;
            }
        >;
        removed?: string[];
        adjusted?: string[];
        products?: Array<
          Product & { drive_image_url: string }
        >;
      };

      if (!res.ok) {
        return data.error ?? "Não foi possível validar o carrinho.";
      }

      const productById = new Map(
        (data.products ?? []).map((p) => [p.id, p] as const)
      );
      const next: CartLine[] = [];

      for (const row of data.lines ?? []) {
        if (row.status === "removed") continue;
        const p = productById.get(row.productId);
        if (!p || row.quantity < 1) continue;
        next.push({
          productId: p.id,
          driveFileId: p.drive_file_id,
          quantity: row.quantity,
          product: productToCartProduct(p),
        });
      }

      const removedCount = data.removed?.length ?? 0;
      const adjustedCount = data.adjusted?.length ?? 0;

      setLines(next);

      if (next.length === 0 && current.length > 0) {
        return "As peças do seu carrinho já não estão disponíveis. Monte o pedido de novo no catálogo.";
      }
      if (removedCount > 0 || adjustedCount > 0) {
        const parts: string[] = [];
        if (removedCount > 0) {
          parts.push(
            `${removedCount} peça${removedCount > 1 ? "s" : ""} esgotou ou saiu do catálogo`
          );
        }
        if (adjustedCount > 0) {
          parts.push(
            `${adjustedCount} linha${adjustedCount > 1 ? "s" : ""} com quantidade reduzida`
          );
        }
        return `${parts.join("; ")}. Revise o carrinho antes de enviar.`;
      }
      return null;
    } catch {
      return "Não foi possível validar o carrinho. Tente de novo.";
    }
  }, [lines]);

  const value = useMemo(
    () => ({
      lines,
      hydrated,
      addProduct,
      setLineQuantity,
      removeLine,
      clear,
      reconcileWithCatalog,
    }),
    [
      lines,
      hydrated,
      addProduct,
      setLineQuantity,
      removeLine,
      clear,
      reconcileWithCatalog,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart fora de CartProvider");
  return ctx;
}
