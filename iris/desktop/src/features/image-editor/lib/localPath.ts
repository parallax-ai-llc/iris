/**
 * Local file identity for editor tabs: the same file opened twice must map to
 * the same tab, whatever slash style or (on Windows) letter case was used.
 */

/** Normalise a local file path into a comparable key. */
export function normalizeLocalPath(filePath: string): string {
  const slashed = filePath.trim().replace(/\\/g, '/');
  // Windows drive (C:/...) and UNC (//server/...) paths are case-insensitive.
  return /^[a-zA-Z]:\//.test(slashed) || slashed.startsWith('//') ? slashed.toLowerCase() : slashed;
}

export function isSameLocalPath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeLocalPath(a) === normalizeLocalPath(b);
}

/** Assets opened from a local file (not uploaded) carry a `local-` id. */
export function isLocalAssetId(id: string | undefined | null): boolean {
  return !!id && id.startsWith('local-');
}
