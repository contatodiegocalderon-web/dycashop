/** Largura no proxy (equilíbrio qualidade / peso). */
export const CATALOG_IMAGE_WIDTH = 380;

/**
 * URL servida pelo próprio site com auth da conta de serviço (imagens não precisam ser "públicas no Drive").
 * O parâmetro `w` aplica redimensionamento JPEG/PNG/WebP (e HEIC após conversão) no servidor.
 */
export function driveThumbnailUrl(fileId: string, width = 640): string {
  const w = Math.min(Math.max(width, 64), 2048);
  return `/api/drive-image/${fileId}?w=${w}`;
}

/** Alias semântico para catálogo / pedidos. */
export function publicDriveImageUrl(
  fileId: string,
  width: number = CATALOG_IMAGE_WIDTH
): string {
  return driveThumbnailUrl(fileId, width);
}
