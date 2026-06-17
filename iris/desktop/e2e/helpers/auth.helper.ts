import type { Page } from '@playwright/test';
import { safeFill, safeClick, assertStep } from './step.helper';

/**
 * Perform email/password login on the Iris Desktop login page.
 *
 * Selector rationale (from iris-desktop/src/app/auth/LoginPage.tsx):
 * - The email field is an <input type="email"> with placeholder "you@example.com"
 * - The password field is an <input> (type="text" or "password") with placeholder "••••••••"
 * - The submit button contains text "Sign In" (or "Signing in..." while loading)
 *
 * The login page is rendered when `isAuthenticated` is false in App.tsx.
 * On success, the auth store sets `isAuthenticated: true` which unmounts
 * the LoginPage and renders the main AppLayout.
 */
export async function login(
  page: Page,
  email?: string,
  password?: string
): Promise<void> {
  const testEmail = email ?? process.env.TEST_USER_EMAIL;
  const testPassword = password ?? process.env.TEST_USER_PASSWORD;

  if (!testEmail || !testPassword) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in iris-desktop/e2e/.env to run login tests.'
    );
  }

  // Fill email input — identified by input[type="email"] with placeholder
  const fillEmail = await safeFill(
    page,
    'input[type="email"][placeholder="you@example.com"]',
    testEmail,
    'Fill email input'
  );
  assertStep(fillEmail);

  // Fill password input — identified by placeholder "••••••••"
  // The type alternates between "password" and "text" based on show/hide toggle,
  // so we match by placeholder instead of type.
  const fillPassword = await safeFill(
    page,
    'input[placeholder="••••••••"]',
    testPassword,
    'Fill password input'
  );
  assertStep(fillPassword);

  // Click the "Sign In" submit button
  const clickSignIn = await safeClick(
    page,
    'button[type="submit"]:has-text("Sign In")',
    'Click Sign In button'
  );
  assertStep(clickSignIn);
}
