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

const STORAGE_KEY = "streetwear-cart-v1";

type CartContextValue = {
  lines: CartLine[];
  addProduct: (product: Product, qty?: number) => void;
  setLineQuantity: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
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
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
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

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, addProduct, setLineQuantity, removeLine, clear }),
    [lines, addProduct, setLineQuantity, removeLine, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart fora de CartProvider");
  return ctx;
}
