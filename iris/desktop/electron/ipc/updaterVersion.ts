/**
 * Pure semver helpers for the auto-updater (no electron imports — keep testable).
 */

export interface ParsedVersion {
  major: number;
  minor: number;
}

export function parseVersion(version: string): ParsedVersion {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)/);
  if (!match) return { major: 0, minor: 0 };
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
}

/**
 * a.n.x 기준 — a(major) 또는 n(minor)이 올라간 업데이트만 실행 전 강제
 * 다운로드(startup gate) 대상이다. 패치(x)만 바뀐 업데이트는 기존 인앱
 * 수동 업데이트 플로우를 유지한다.
 * 파싱 실패 시 false(강제 아님)로 폴백 — 잘못된 버전 문자열 때문에
 * 부팅이 막히지 않게 한다.
 */
export function isMandatoryUpdate(currentVersion: string, nextVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const next = parseVersion(nextVersion);
  if (next.major !== current.major) return next.major > current.major;
  return next.minor > current.minor;
}
