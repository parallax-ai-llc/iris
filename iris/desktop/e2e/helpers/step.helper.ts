import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { StepResult } from './types';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tmp/test-screenshots');

/**
 * Capture a screenshot and return its path.
 * Returns undefined if the capture fails (e.g. page already closed).
 */
async function captureScreenshot(
  page: Page,
  stepName: string
): Promise<string | undefined> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeName = stepName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

/**
 * Safely click an element identified by a Playwright locator string.
 * Returns a StepResult indicating success or failure with diagnostics.
 */
export async function safeClick(
  page: Page,
  selector: string,
  stepName: string,
  options?: { timeout?: number }
): Promise<StepResult> {
  const timeout = options?.timeout ?? 10_000;

  try {
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click({ timeout });

    return {
      success: true,
      step: stepName,
      timestamp: Date.now(),
    };
  } catch (error) {
    const screenshot = await captureScreenshot(page, stepName);
    return {
      success: false,
      step: stepName,
      expected: `Element "${selector}" to be visible and clickable`,
      actual: error instanceof Error ? error.message : String(error),
      screenshot,
      timestamp: Date.now(),
    };
  }
}

/**
 * Safely fill a text input identified by a Playwright locator string.
 * Clears existing content before filling.
 */
export async function safeFill(
  page: Page,
  selector: string,
  value: string,
  stepName: string,
  options?: { timeout?: number }
): Promise<StepResult> {
  const timeout = options?.timeout ?? 10_000;

  try {
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    await locator.fill(value, { timeout });

    return {
      success: true,
      step: stepName,
      timestamp: Date.now(),
    };
  } catch (error) {
    const screenshot = await captureScreenshot(page, stepName);
    return {
      success: false,
      step: stepName,
      expected: `Element "${selector}" to be fillable with value`,
      actual: error instanceof Error ? error.message : String(error),
      screenshot,
      timestamp: Date.now(),
    };
  }
}

/**
 * Safely assert that an element matching the selector is visible on the page.
 */
export async function safeExpectVisible(
  page: Page,
  selector: string,
  stepName: string,
  options?: { timeout?: number }
): Promise<StepResult> {
  const timeout = options?.timeout ?? 10_000;

  try {
    const locator = page.locator(selector);
    await expect(locator).toBeVisible({ timeout });

    return {
      success: true,
      step: stepName,
      timestamp: Date.now(),
    };
  } catch (error) {
    const screenshot = await captureScreenshot(page, stepName);
    return {
      success: false,
      step: stepName,
      expected: `Element "${selector}" to be visible`,
      actual: error instanceof Error ? error.message : String(error),
      screenshot,
      timestamp: Date.now(),
    };
  }
}

/**
 * Assert that a StepResult was successful.
 * If the step failed, the test is failed with a descriptive message
 * including expected/actual values and the screenshot path.
 */
export function assertStep(result: StepResult): void {
  if (!result.success) {
    const parts = [`Step failed: "${result.step}"`];
    if (result.expected) parts.push(`  Expected: ${result.expected}`);
    if (result.actual) parts.push(`  Actual:   ${result.actual}`);
    if (result.screenshot) parts.push(`  Screenshot: ${result.screenshot}`);
    throw new Error(parts.join('\n'));
  }
}
