/**
 * Extrai o ID do vídeo a partir de URLs típicas do YouTube (watch, youtu.be, embed, shorts).
 */
export function parseYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let urlStr = trimmed;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;

  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return normalizeYoutubeId(id);
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.slice("/embed/".length).split("/")[0];
        return normalizeYoutubeId(id);
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.slice("/shorts/".length).split("/")[0];
        return normalizeYoutubeId(id);
      }
      if (u.pathname === "/watch" || u.pathname.startsWith("/watch/")) {
        const v = u.searchParams.get("v");
        return normalizeYoutubeId(v);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeYoutubeId(id: string | null | undefined): string | null {
  if (!id) return null;
  const clean = id.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return clean;
  return null;
}

/** URL segura para `<iframe src>` (sem cookies de marcação; `rel=0` limita vídeos sugeridos). */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`;
}
