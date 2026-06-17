// i18n seam — delegates to the host-provided `t` (iris/web's real i18n, or a
// fallback in the local host).
import { useSeams } from '@editor/seams';

export function useI18n() {
  const { t } = useSeams();
  // iris/web's `t` returns string; some call sites do `t('a.b') as string`.
  return { t: t as (key: string, params?: unknown) => string };
}
