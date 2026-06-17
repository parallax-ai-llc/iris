/**
 * Self-host (open-source) mode flag.
 *
 * The desktop app ships in two flavours from one codebase:
 *  - **Parallax cloud** (default): signs in to api.parallax.kr; cloud image/video
 *    generation, profile, and billing.
 *  - **Self-host / open-source**: runs workflows fully locally (BYOK) with **no
 *    login, no cloud profile, and no cloud connection polling**. The login flow
 *    and auth logic are skipped entirely.
 *
 * Enabled by building/running with `--mode selfhost` (see `.env.selfhost`, which
 * sets `VITE_SELF_HOST=1`). Cloud builds leave it unset → `false`, so their
 * behaviour is unchanged.
 */
export const IS_SELF_HOST = import.meta.env.VITE_SELF_HOST === '1';
