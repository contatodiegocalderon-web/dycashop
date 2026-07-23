/** Plano de revenda / dropshipping DYCASHOP — funil de conversão na home. */

export const DROP_MONTHLY_PRICE_BRL = 100;

/** Preço de atacado por peça nas categorias principais (1 peça). */
export const DROP_WHOLESALE_UNIT_BRL = 25;

/** Checkout do plano (Kiwify). */
export const DROP_CHECKOUT_URL = "https://pay.kiwify.com.br/C6JV9t8";

export const DROP_CATALOG_DRIVE_URL =
  "https://drive.google.com/drive/folders/1qMLAaPdhvOhkusmrQKKux9AniWQNQgEd?usp=drive_link";

/** Defaults da calculadora (30 camisetas/mês a R$60 → R$1.050 com custo R$25). */
export const DROP_CALC_DEFAULT_SALE_BRL = 60;
export const DROP_CALC_DEFAULT_QTY_PER_MONTH = 30;

/** Tabela do funil — preços exclusivos a partir de 1 peça. */
export type DropMemberPriceRow = {
  label: string;
  price: number;
};

export const DROP_MEMBER_PRICE_ROWS: DropMemberPriceRow[] = [
  { label: "Camisetas", price: 25 },
  { label: "Bermudas", price: 25 },
  { label: "Camiseta dry-fit", price: 25 },
  { label: "Calças elastano", price: 25 },
  { label: "Kit cuecas", price: 40 },
  { label: "Blusa moletom", price: 70 },
  { label: "Conjunto dryfit frio", price: 60 },
  { label: "Jeans", price: 65 },
];
