import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import heicConvert from "heic-convert";
import sharp from "sharp";
import { Readable } from "stream";
import { ensureDriveAuthorized, getDriveAuth } from "@/lib/drive-auth";
import { bufferLooksLikeHeif } from "@/lib/drive-image-sniff";

export const runtime = "nodejs";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const FILE_ID_RE = /^[A-Za-z0-9_-]{10,128}$/;

async function heicToJpeg(buf: Buffer): Promise<Buffer> {
  const out = await heicConvert({
    buffer: buf,
    format: "JPEG",
    quality: 0.88,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

/**
 * Reduz largura do buffer de imagem (acelera carga: menos bytes no browser).
 */
async function maybeResizeToWidth(
  body: Buffer,
  mimeType: string,
  targetW: number
): Promise<{ body: Buffer; mimeType: string }> {
  if (targetW <= 0) return { body, mimeType };
  if (!mimeType.startsWith("image/") || mimeType === "image/gif") {
    return { body, mimeType };
  }

  try {
    const img = sharp(body).rotate();
    const meta = await img.metadata();
    if (meta.width && meta.width <= targetW) {
      return { body, mimeType };
    }

    const jpegQuality =
      targetW <= 420 ? 84 : targetW <= 900 ? 86 : 88;

    const resized = await img
      .resize({
        width: targetW,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: jpegQuality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
        progressive: true,
      })
      .toBuffer();

    return { body: resized, mimeType: "image/jpeg" };
  } catch (e) {
    console.error("drive-image resize:", e);
    return { body, mimeType };
  }
}

/**
 * GET /api/drive-image/[fileId]?w=400
 * Faz proxy da imagem com OAuth/conta de serviço.
 * — Converte HEIC/HEIF para JPEG via heic-convert.
 * — `w` redimensiona no servidor (menos dados na rede).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const fileId = params.fileId;
  if (!FILE_ID_RE.test(fileId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const wRaw = request.nextUrl.searchParams.get("w");
  const parsedW = wRaw ? parseInt(wRaw, 10) : NaN;
  const targetW =
    Number.isFinite(parsedW) && parsedW > 0 ? Math.min(parsedW, 2048) : 0;

  try {
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
      try {
        body = await heicToJpeg(body);
        mimeType = "image/jpeg";
      } catch (convErr) {
        console.error("drive-image HEIC:", convErr);
        return NextResponse.json(
          {
            error:
              "Não foi possível converter HEIC. Exporte a foto em JPEG no telemóvel ou regrave em PNG.",
          },
          { status: 502 }
        );
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

    if (targetW > 0) {
      const out = await maybeResizeToWidth(body, mimeType, targetW);
      body = out.body;
      mimeType = out.mimeType;
    }

    const cacheMax =
      targetW > 0
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400, s-maxage=86400";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": cacheMax,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter imagem";
    const status = /404|not found|notFound/i.test(msg) ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
