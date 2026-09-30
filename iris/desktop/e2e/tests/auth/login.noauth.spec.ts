import { test, expect } from '../../fixtures/electron.fixture';
import {
  safeExpectVisible,
  assertStep,
} from '../../helpers/step.helper';

/**
 * Auth / Login E2E tests for Iris Desktop (Electron).
 *
 * These tests launch the built Electron app and interact with the real UI.
 * Selectors are derived from:
 *   - iris-desktop/src/app/auth/LoginPage.tsx (login form)
 *   - iris-desktop/src/App.tsx (auth gating, loading state)
 *   - iris-desktop/src/features/auth/stores/auth.store.ts (auth state management)
 *   - iris-desktop/electron/ipc/auth.ts (token persistence via electron-store)
 *   - iris-desktop/electron/preload.ts (IPC bridge: auth:getToken, auth:setToken, etc.)
 */

test.describe('Auth - Login', () => {
  test('app launches successfully', async ({ page, electronApp }) => {
    // Verify the Electron app launched and a window is available
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);

    // The page should have a non-empty title or at minimum be loaded
    const title = await page.title();
    expect(typeof title).toBe('string');

    // Verify the window has reasonable dimensions via evaluate (viewportSize() returns null for Electron windows)
    const windowSize = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    expect(windowSize.width).toBeGreaterThanOrEqual(800);
    expect(windowSize.height).toBeGreaterThanOrEqual(600);
  });

  test('login page loads', async ({ page }) => {
    // ⚠️ The app is NOT login-gated: it boots straight into the shell and is
    // usable without an account. LoginPage renders as an opt-in overlay
    // (App.tsx <LoginOverlay />) that the sidebar "Sign in" button opens.
    // Waiting for it to appear on its own hangs until timeout.
    await page.waitForSelector('nav', { state: 'visible', timeout: 15_000 });

    // The sidebar only offers "Sign in" when no user is loaded, and tokens
    // persist in electron-store across runs — including the auth-setup project,
    // which Playwright runs in the same phase as this one, right before it.
    // Put the renderer into a logged-out state IN MEMORY ONLY so this test does
    // not depend on leftover state. Do not call logout() here: it clears the
    // persisted tokens, and the `authenticated` project (which runs after this
    // one in a full run) would then start without a session.
    // __ZUSTAND_STORES__ is exposed by App.tsx in dev mode for exactly this
    // (from an effect, so wait for it rather than assume it is already there).
    await page.waitForFunction(
      () =>
        Boolean(
          (window as unknown as { __ZUSTAND_STORES__?: { auth?: unknown } })
            .__ZUSTAND_STORES__?.auth
        ),
      undefined,
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      const auth = (window as unknown as {
        __ZUSTAND_STORES__: {
          auth: {
            setState: (partial: Record<string, unknown>) => void;
            subscribe: (listener: (state: { user: unknown }) => void) => () => void;
          };
        };
      }).__ZUSTAND_STORES__.auth;

      const signOutInMemory = () =>
        auth.setState({ user: null, isAuthenticated: false, error: null });

      // The boot-time checkAuth() may still be in flight (React.StrictMode runs
      // it twice in dev), and its completion would restore the user right after
      // we cleared it — so keep the user cleared for the lifetime of this page.
      auth.subscribe((state) => {
        if (state.user) signOutInMemory();
      });
      signOutInMemory();
    });

    // Open the login overlay the way a user does.
    const signInButton = page.getByRole('button', { name: /sign in/i }).first();
    await signInButton.waitFor({ state: 'visible', timeout: 15_000 });
    await signInButton.click();

    // Verify the heading "Welcome to Iris" is visible (LoginPage.tsx line 108)
    const headingVisible = await safeExpectVisible(
      page,
      'h1:has-text("Welcome to Iris")',
      'Welcome heading visible',
      { timeout: 15_000 }
    );
    assertStep(headingVisible);

    // Verify the subtitle "Sign in to continue" (LoginPage.tsx line 109)
    const subtitleVisible = await safeExpectVisible(
      page,
      'text=Sign in to continue',
      'Subtitle visible'
    );
    assertStep(subtitleVisible);

    // Verify the email input is present (LoginPage.tsx line 172-185)
    const emailInputVisible = await safeExpectVisible(
      page,
      'input[type="email"][placeholder="you@example.com"]',
      'Email input visible'
    );
    assertStep(emailInputVisible);

    // Verify the password input is present (LoginPage.tsx line 194-206)
    const passwordInputVisible = await safeExpectVisible(
      page,
      'input[placeholder="••••••••"]',
      'Password input visible'
    );
    assertStep(passwordInputVisible);

    // Verify the "Sign In" submit button exists (LoginPage.tsx line 230-249)
    const signInButtonVisible = await safeExpectVisible(
      page,
      'button[type="submit"]:has-text("Sign In")',
      'Sign In button visible'
    );
    assertStep(signInButtonVisible);

    // Verify the "Continue with Google" OAuth button (LoginPage.tsx line 114-132)
    const googleButtonVisible = await safeExpectVisible(
      page,
      'button:has-text("Continue with Google")',
      'Google OAuth button visible'
    );
    assertStep(googleButtonVisible);

    // Verify the "Continue with Apple" OAuth button (LoginPage.tsx line 134-152)
    const appleButtonVisible = await safeExpectVisible(
      page,
      'button:has-text("Continue with Apple")',
      'Apple OAuth button visible'
    );
    assertStep(appleButtonVisible);

    // Verify the "or continue with email" divider text (LoginPage.tsx line 161)
    const dividerVisible = await safeExpectVisible(
      page,
      'text=or continue with email',
      'Email divider text visible'
    );
    assertStep(dividerVisible);

    // Verify the "Sign up" link exists (LoginPage.tsx footer).
    // Host is parallax.kr (LoginPage.tsx footer link).
    const signUpLinkVisible = await safeExpectVisible(
      page,
      'a[href="https://parallax.kr/signup"]:has-text("Sign up")',
      'Sign up link visible'
    );
    assertStep(signUpLinkVisible);
  });

  // NOTE: "successful login" / "login persists" 테스트는 auth.setup.ts에서 수행.
  // noauth project에서는 로그인 전 상태의 UI만 테스트.
});
