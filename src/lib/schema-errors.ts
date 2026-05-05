/** Erro Postgres 42703 ou mensagem «column … does not exist». */
export function isMissingSchemaColumnError(err: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    err.code === "42703" ||
    (m.includes("column") && m.includes("does not exist"))
  );
}
