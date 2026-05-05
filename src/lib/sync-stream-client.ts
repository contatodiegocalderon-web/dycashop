/**
 * Lê resposta `application/x-ndjson` da sincronização (linha a linha).
 */
export async function consumeSyncNdjsonStream(
  response: Response,
  onLine: (obj: unknown) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Resposta sem corpo");
  }
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        onLine(JSON.parse(t));
      } catch {
        /* linha incompleta ou ruído */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      onLine(JSON.parse(tail));
    } catch {
      /* ignore */
    }
  }
}
