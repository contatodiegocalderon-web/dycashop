import Link from "next/link";
import { CategoryGrid } from "@/components/category-grid";
import { DropshippingCta } from "@/components/dropshipping-funnel";
import { HomeBannerCarousel } from "@/components/home-banner-carousel";
import { VideoCallCta } from "@/components/video-call-cta";
import { getCatalogCategories } from "@/lib/catalog-categories";
import { sortHomeBanners, type HomeBanner } from "@/lib/home-banners";
import { createAdminClient } from "@/lib/supabase/admin";

/** Lista pastas/categorias sempre com dados atuais (evita HTML estático desatualizado). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHomeBanners(): Promise<HomeBanner[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("home_banners")
      .select("id, image_url, image_url_mobile, href, sort_order, active, created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("[home] banners:", error.message);
      return [];
    }
    return sortHomeBanners((data ?? []) as HomeBanner[]);
  } catch (e) {
    console.error("[home] banners:", e);
    return [];
  }
}

export default async function HomePage() {
  const [categories, banners] = await Promise.all([
    getCatalogCategories(),
    getHomeBanners(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-8 sm:px-5">
      <HomeBannerCarousel banners={banners} />

      <CategoryGrid categories={categories} />

      <VideoCallCta />

      <div className="mt-12 flex flex-col items-center gap-4">
        <Link
          href="/carrinho"
          prefetch
          className="text-center text-xs font-medium text-stone-400 transition-colors hover:text-stone-200"
        >
          Ver carrinho
        </Link>
        <div className="w-full max-w-md">
          <DropshippingCta />
        </div>
      </div>
    </div>
  );
}
