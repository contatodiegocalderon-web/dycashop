export type ProductSize = "M" | "G" | "GG";

export type ProductStatus = "ATIVO" | "ESGOTADO";

export type OrderStatus = "PENDENTE_PAGAMENTO" | "PAGO" | "CANCELADO";

export type ProductSyncStatus = "pending" | "done" | "error";

export interface Product {
  id: string;
  drive_file_id: string;
  /** Metadado `modifiedTime` do Google Drive (última vez que confirmámos o ficheiro). */
  drive_updated_at?: string | null;
  /** URL pública no Supabase Storage após sync bem-sucedido. */
  image_url?: string | null;
  sync_status?: ProductSyncStatus | null;
  /** @deprecated usar image_url */
  catalog_image_url?: string | null;
  drive_image_url: string;
  original_file_name: string;
  /** Pasta de categoria no Drive (ex.: JEANS), se usares o layout com subpastas por categoria. */
  category: string | null;
  brand: string;
  color: string;
  size: ProductSize;
  stock: number;
  sku: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface CartLine {
  productId: string;
  driveFileId: string;
  quantity: number;
  product: Pick<
    Product,
    | "drive_image_url"
    | "original_file_name"
    | "category"
    | "brand"
    | "color"
    | "size"
    | "stock"
    | "sku"
  >;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  /** Null se o produto foi removido do catálogo (ex.: já não existe no Drive). */
  product_id: string | null;
  quantity: number;
  snapshot_image_url: string;
  snapshot_original_name: string;
  snapshot_brand: string;
  snapshot_color: string;
  snapshot_size: string;
  snapshot_drive_file_id: string;
  snapshot_category?: string | null;
  created_at: string;
}

export type CustomerSegment = "NOVO" | "ANTIGO";

export interface OrderRow {
  id: string;
  /** Número de vitrine (único, conta todos os pedidos por ordem de criação). */
  display_number?: number;
  status: OrderStatus;
  customer_note: string | null;
  /** Token para o cliente abrir /recibo/[token]. */
  public_token?: string | null;
  sale_amount?: number | null;
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  customer_segment?: CustomerSegment | null;
  requested_seller_name?: string | null;
  requested_seller_phone?: string | null;
  confirmed_at?: string | null;
  /** Quem confirmou o pagamento (vendedor/dono) quando sessão staff. */
  confirmed_by_staff_id?: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
}

export interface ParsedFileName {
  brand: string;
  color: string;
  /** Último número no nome; só define estoque na primeira importação (produto novo). */
  initialStockFromFilename: number | null;
  baseLabel: string;
}
