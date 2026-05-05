/**
 * Extrai o ID da pasta a partir de URLs típicas do Google Drive ou do próprio ID.
 */
export function extractDriveFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  const idOnly = /^[A-Za-z0-9_-]{15,128}$/;
  if (idOnly.test(s)) return s;

  const patterns: RegExp[] = [
    /\/folders\/([A-Za-z0-9_-]+)/,
    /\/drive\/u\/\d+\/folders\/([A-Za-z0-9_-]+)/,
    /[?&]id=([A-Za-z0-9_-]+)/,
    /\/folderview\?[^#]*id=([A-Za-z0-9_-]+)/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1] && idOnly.test(m[1])) return m[1];
  }

  return null;
}
