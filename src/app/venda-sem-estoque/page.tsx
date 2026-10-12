import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { DropLanding } from "@/components/drop-landing";
import {
  getCatalogCategories,
  type CategorySummary,
} from "@/lib/catalog-categories";

export const metadata: Metadata = {
  title: "Venda sem estoque · DYCASHOP",
  description:
    "Monte sua loja de roupas sem comprar estoque: preço de atacado em 1 peça, conteúdo pronto todo dia e despacho em até 24h direto pro seu cliente.",
};

export const revalidate = 300;

async function getFeedbackImages(): Promise<{ hero: string[]; rail: string[] }> {
  try {
    const dir = path.join(process.cwd(), "public", "feedbacks");
    const files = (await readdir(dir))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const toUrl = (f: string) => `/feedbacks/${encodeURIComponent(f)}`;
    const heroFiles = files.filter((f) => f.toLowerCase().startsWith("hero-"));
    const rest = files.filter((f) => !heroFiles.includes(f));
    if (heroFiles.length >= 3) {
      return { hero: heroFiles.slice(0, 3).map(toUrl), rail: rest.map(toUrl) };
    }
    const all = [...heroFiles, ...rest];
    if (all.length < 3) return { hero: [], rail: all.map(toUrl) };
    return { hero: all.slice(0, 3).map(toUrl), rail: all.slice(3).map(toUrl) };
  } catch {
    return { hero: [], rail: [] };
  }
}

export default async function VendaSemEstoquePage() {
  let categories: CategorySummary[] = [];
  try {
    categories = await getCatalogCategories();
  } catch (e) {
    console.error("[venda-sem-estoque] categorias:", e);
  }
  const { hero, rail } = await getFeedbackImages();
  return <DropLanding categories={categories} heroShots={hero} railShots={rail} />;
}
