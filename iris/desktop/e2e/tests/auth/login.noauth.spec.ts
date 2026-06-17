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
 *   - iris-desktop/src/stores/auth.store.ts (auth state management)
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
    // After the initial isLoading state resolves (checkAuth in App.tsx),
    // the app shows LoginPage when isAuthenticated is false.
    // Wait for the loading indicator to disappear first.
    // The loading state shows text "Loading..." (App.tsx line 65).
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15_000 }).catch(() => {
      // Loading may already be gone by the time we check
    });

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

    // Verify the "Sign up" link exists (LoginPage.tsx line 255-260)
    const signUpLinkVisible = await safeExpectVisible(
      page,
      'a[href="https://parallax.ai/signup"]:has-text("Sign up")',
      'Sign up link visible'
    );
    assertStep(signUpLinkVisible);
  });

  // NOTE: "successful login" / "login persists" 테스트는 auth.setup.ts에서 수행.
  // noauth project에서는 로그인 전 상태의 UI만 테스트.
});
