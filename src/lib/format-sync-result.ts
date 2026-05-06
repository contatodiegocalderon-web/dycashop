import type { SyncResult } from "@/services/drive-sync";

export function formatSyncResultSummary(r: SyncResult): string {
  if (r.message && r.imported === 0) {
    return r.message;
  }
  const parts = [
    `Produtos no catálogo: ${r.imported} (${r.totalParsed} ficheiros no Drive).`,
    `Removidos por não existir no Drive: ${r.removedMissingFromDrive ?? 0}.`,
    `Imagens Storage: ${r.storageUploaded} enviadas, ${r.storageSkipped} já atualizadas (ignoradas).`,
  ];
  if (r.storageErrors?.length) {
    parts.push(`Erros de imagem: ${r.storageErrors.length}.`);
  }
  parts.push(
    `Renomeação no Drive: ${r.driveRenameOk} ok${r.driveRenameErrors?.length ? `, ${r.driveRenameErrors.length} falhas.` : "."}`
  );
  if (r.driveRenameErrors?.length) {
    const sample = r.driveRenameErrors.slice(0, 5);
    parts.push("Primeiros erros de renomeação:");
    for (const er of sample) {
      parts.push(`- ${er.productId}: ${er.message}`);
    }
    if (r.driveRenameErrors.length > sample.length) {
      parts.push(
        `- … e mais ${r.driveRenameErrors.length - sample.length} erro(s).`
      );
    }
  }
  return parts.join("\n");
}
