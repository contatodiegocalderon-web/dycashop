/** Dimensões padrão de embalagem para streetwear (cm). */
export const DEFAULT_PACKAGE_CM = {
  length: 25,
  width: 20,
  height: 12,
} as const;

export function packageWeightKg(weightKg: number): number {
  return Math.max(0.1, Math.min(30, Math.round(weightKg * 100) / 100));
}
