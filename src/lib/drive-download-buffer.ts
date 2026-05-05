import { google } from "googleapis";
import heicConvert from "heic-convert";
import type { Readable } from "stream";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
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

/**
 * Descarrega bytes da imagem no Drive (OAuth já configurado).
 * Converte HEIC/HEIF para JPEG quando necessário.
 */
export async function fetchDriveFileAsImageBuffer(fileId: string): Promise<{
  buffer: Buffer;
  /** Mime normalizado para gravar no Storage (jpeg/png/webp/gif). */
  contentType: string;
}> {
  const auth = await getDriveAuth();
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
    body = await heicToJpeg(body);
    mimeType = "image/jpeg";
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
