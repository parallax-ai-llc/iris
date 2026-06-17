import { test, expect } from '../../fixtures/electron.fixture';

test('debug auth state', async ({ page, electronApp }) => {
  // Capture console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Wait longer
  await page.waitForTimeout(3000);
  
  // Check what's on the page
  const title = await page.title();
  console.log('Title:', title);
  
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  console.log('Body text:', bodyText);
  
  // Check electronAPI
  const apiCheck = await page.evaluate(() => {
    return {
      hasAPI: typeof window.electronAPI !== 'undefined',
      hasAuth: typeof window.electronAPI?.auth !== 'undefined',
      hasGetToken: typeof window.electronAPI?.auth?.getToken !== 'undefined',
    };
  });
  console.log('API check:', JSON.stringify(apiCheck));
  
  // Try getToken
  const token = await page.evaluate(async () => {
    try {
      return await window.electronAPI?.auth?.getToken();
    } catch (e: any) {
      return 'ERROR: ' + e.message;
    }
  });
  console.log('Token:', token);
});
