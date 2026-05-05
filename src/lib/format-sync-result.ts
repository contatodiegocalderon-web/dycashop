import type { SyncResult } from "@/services/drive-sync";

export function formatSyncResultSummary(r: SyncResult): string {
  if (r.message && r.imported === 0) {
    return r.message;
  }
  const parts = [
    `Produtos no catálogo: ${r.imported} (${r.totalParsed} ficheiros no Drive).`,
    `Imagens Storage: ${r.storageUploaded} enviadas, ${r.storageSkipped} já atualizadas (ignoradas).`,
  ];
  if (r.storageErrors?.length) {
    parts.push(`Erros de imagem: ${r.storageErrors.length}.`);
  }
  parts.push(
    `Renomeação no Drive: ${r.driveRenameOk} ok${r.driveRenameErrors?.length ? `, ${r.driveRenameErrors.length} falhas.` : "."}`
  );
  return parts.join("\n");
}
