import { google } from "googleapis";
import heicConvert from "heic-convert";
import type { Readable } from "stream";
import type { DriveAuthClient } from "@/lib/drive-auth";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { withRetry } from "@/lib/retry";
import { bufferLooksLikeHeif } from "@/lib/drive-image-sniff";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const out = await heicConvert({
    buffer: buf,
    format: "JPEG",
    quality: 0.88,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

async function accessToken(auth: DriveAuthClient): Promise<string | null> {
  const res = await auth.getAccessToken();
  if (typeof res === "string") return res || null;
  if (res && typeof res === "object" && "token" in res) {
    return res.token ?? null;
  }
  return null;
}

/**
 * O Drive já gera um JPEG (~1600px). Serve quando o HEIC não converte no servidor
 * (libvips sem HEIF) e evita descarregar o original de vários MB.
 */
export async function fetchDriveThumbnailJpeg(
  fileId: string,
  auth: DriveAuthClient
): Promise<Buffer | null> {
  const drive = google.drive({ version: "v3", auth });
  const meta = await drive.files.get({
    fileId,
    fields: "thumbnailLink",
    supportsAllDrives: true,
  });
  const raw = meta.data.thumbnailLink?.trim();
  if (!raw) return null;
  const large = raw.replace(/=s\d+/, "=s1600");
  const token = await accessToken(auth);
  const res = await fetch(large, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

/**
 * Descarrega bytes da imagem no Drive (OAuth já configurado).
 * Converte HEIC/HEIF para JPEG quando necessário.
 */
export async function fetchDriveFileAsImageBuffer(
  fileId: string,
  authOverride?: DriveAuthClient
): Promise<{
  buffer: Buffer;
  /** Mime normalizado para gravar no Storage (jpeg/png/webp/gif). */
  contentType: string;
}> {
  return withRetry(
    () => downloadDriveFileOnce(fileId, authOverride),
    { label: `drive-download:${fileId}`, attempts: 4, baseDelayMs: 800 }
  );
}

async function downloadDriveFileOnce(
  fileId: string,
  authOverride?: DriveAuthClient
): Promise<{ buffer: Buffer; contentType: string }> {
  const auth = authOverride ?? (await getDriveAuth());
  await ensureDriveAuthorized(auth);
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({
    fileId,
    fields: "mimeType",
    supportsAllDrives: true,
  });
  let mimeType =
    meta.data.mimeType?.split(";")[0]?.trim() ??
    "application/octet-stream";

  const res = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "stream" }
  );

  const nodeStream = res.data as Readable;
  let body = await streamToBuffer(nodeStream);

  const isHeifMeta =
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType === "image/heif-sequence";
  const isHeifSniff =
    mimeType === "application/octet-stream" && bufferLooksLikeHeif(body);

  if (isHeifMeta || isHeifSniff) {
    try {
      body = await heicToJpeg(body);
      mimeType = "image/jpeg";
    } catch (convErr) {
      const thumb = await fetchDriveThumbnailJpeg(fileId, auth).catch(() => null);
      if (!thumb) throw convErr;
      body = thumb;
      mimeType = "image/jpeg";
    }
  }

  if (mimeType === "application/octet-stream" && body.length >= 3) {
    if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
      mimeType = "image/jpeg";
    } else if (
      body[0] === 0x89 &&
      body[1] === 0x50 &&
      body[2] === 0x4e &&
      body[3] === 0x47
    ) {
      mimeType = "image/png";
    } else if (
      body[0] === 0x47 &&
      body[1] === 0x49 &&
      body[2] === 0x46 &&
      body[3] === 0x38
    ) {
      mimeType = "image/gif";
    } else if (
      body[0] === 0x52 &&
      body[1] === 0x49 &&
      body[2] === 0x46 &&
      body[3] === 0x46 &&
      body.length >= 12 &&
      body[8] === 0x57 &&
      body[9] === 0x45 &&
      body[10] === 0x42 &&
      body[11] === 0x50
    ) {
      mimeType = "image/webp";
    }
  }

  return { buffer: body, contentType: mimeType };
}
