/**
 * Minimal semver comparison for extension update checks.
 *
 * Handles "MAJOR.MINOR.PATCH" cores with an optional pre-release suffix
 * ("1.2.0-beta.1"). A pre-release compares as older than the same core
 * version without one. Malformed segments compare as 0 so a bad version
 * string never throws — it just never wins a comparison.
 */

interface ParsedVersion {
  nums: number[];
  prerelease: string | null;
}

function parseVersion(version: string): ParsedVersion {
  const trimmed = version.trim().replace(/^v/i, '');
  const dashIndex = trimmed.indexOf('-');
  const core = dashIndex === -1 ? trimmed : trimmed.slice(0, dashIndex);
  const prerelease = dashIndex === -1 ? null : trimmed.slice(dashIndex + 1);
  const nums = core.split('.').map((part) => {
    const n = parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
  return { nums, prerelease: prerelease || null };
}

/** Standard comparator: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  const len = Math.max(va.nums.length, vb.nums.length);
  for (let i = 0; i < len; i++) {
    const diff = (va.nums[i] ?? 0) - (vb.nums[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && vb.prerelease) {
    if (va.prerelease === vb.prerelease) return 0;
    return va.prerelease < vb.prerelease ? -1 : 1;
  }
  return 0;
}

/** True when `candidate` is strictly newer than `installed`. */
export function isNewerVersion(candidate: string, installed: string): boolean {
  return compareVersions(candidate, installed) > 0;
}
