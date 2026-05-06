/** Vendedores para checkout (WhatsApp) e rodapé — manter sincronizado. */
export type WhatsAppSeller = {
  name: string;
  phone: string;
  /**
   * Foto de rosto no modal do carrinho (ficheiro em `public/`).
   * Ex.: `/vendedores/diego.jpg` — JPEG/WebP ~400px; se faltar o ficheiro, mostram-se iniciais.
   */
  photoUrl?: string;
};

export const WHATSAPP_SELLERS: WhatsAppSeller[] = [
  {
    name: "Diego",
    phone: "5511958936770",
    photoUrl: "/vendedores/diego.jpg",
  },
  {
    name: "Paulo",
    phone: "5511916485901",
    photoUrl: "/vendedores/paulo.jpg",
  },
  {
    name: "Rafael",
    phone: "5511990041490",
    photoUrl: "/vendedores/rafael.jpg",
  },
];
