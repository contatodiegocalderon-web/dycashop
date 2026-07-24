export type HomeBanner = {
  id: string;
  image_url: string;
  image_url_mobile: string | null;
  storage_path: string | null;
  storage_path_mobile: string | null;
  href: string | null;
  sort_order: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export function sortHomeBanners<T extends { sort_order: number; created_at?: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });
}

/** Desktop (largo) vs celular (proporção do box antigo ~16:10). */
export type HomeBannerVariant = "desktop" | "mobile";
