/** ISO BMFF `ftyp` + marcas HEIF comuns (Drive por vezes declara só octet-stream). */
export function bufferLooksLikeHeif(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) {
    return false;
  }
  const brand = buf.subarray(8, 12).toString("ascii");
  return /^(heic|heix|hevc|heis|hevm|hevx|mif1|msf1)/i.test(brand);
}
