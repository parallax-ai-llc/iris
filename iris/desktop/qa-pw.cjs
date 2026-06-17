const { chromium } = require('playwright');
const os = require('os');
const path = require('path');

const CDP_PORT = process.env.CDP_PORT || '9225';
const args = process.argv.slice(2);
const action = args[0];

async function run() {
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  if (!context) { console.error('No browser context found'); process.exit(1); }
  const page = context.pages()[0];
  if (!page) { console.error('No page found'); process.exit(1); }

  try {
    switch (action) {
      case 'snapshot': {
        const title = await page.title();
        const text = await page.evaluate(() => {
          function walk(el, depth = 0) {
            const lines = [];
            const tag = el.tagName?.toLowerCase() || '';
            const role = el.getAttribute?.('role') || '';
            const ariaLabel = el.getAttribute?.('aria-label') || '';
            const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
              ? el.childNodes[0].textContent.trim() : '';
            const indent = '  '.repeat(depth);
            if (['button', 'a', 'input', 'select', 'textarea'].includes(tag) || role) {
              const label = ariaLabel || text || el.textContent?.trim().substring(0, 80) || '';
              const type = el.getAttribute?.('type') || '';
              const placeholder = el.getAttribute?.('placeholder') || '';
              const value = el.value || '';
              let desc = `${indent}- ${role || tag}`;
              if (label) desc += `: "${label}"`;
              if (type) desc += ` [type=${type}]`;
              if (placeholder) desc += ` [placeholder="${placeholder}"]`;
              if (value) desc += ` [value="${value}"]`;
              if (el.disabled) desc += ' [disabled]';
              lines.push(desc);
            }
            else if (/^h[1-6]$/.test(tag)) {
              lines.push(`${indent}- heading(${tag}): "${el.textContent.trim().substring(0, 120)}"`);
            }
            else if (['p', 'span', 'label', 'li'].includes(tag) && text) {
              lines.push(`${indent}- ${tag}: "${text.substring(0, 120)}"`);
            }
            for (const child of el.children || []) {
              lines.push(...walk(child, depth + (lines.length > 0 ? 1 : 0)));
            }
            return lines;
          }
          return walk(document.body).join('\n');
        });
        console.log(`Page: ${title}\n${text}`);
        break;
      }
      case 'click': {
        const selector = args[1];
        await page.click(selector, { timeout: 10000 });
        console.log(`Clicked: ${selector}`);
        break;
      }
      case 'fill': {
        const selector = args[1];
        const value = args[2];
        await page.fill(selector, value, { timeout: 10000 });
        console.log(`Filled: ${selector} with "${value}"`);
        break;
      }
      case 'eval': {
        const code = args[1];
        const result = await page.evaluate(code);
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
        break;
      }
      case 'screenshot': {
        const filePath = args[1] || path.join(os.tmpdir(), 'qa-desktop-screenshot.png');
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`Screenshot saved: ${filePath}`);
        break;
      }
      case 'wait': {
        const ms = parseInt(args[1]) || 1000;
        await page.waitForTimeout(ms);
        console.log(`Waited ${ms}ms`);
        break;
      }
      case 'text': {
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log(bodyText);
        break;
      }
      case 'locator-click': {
        const text = args[1];
        await page.locator(`text="${text}"`).first().click({ timeout: 10000 });
        console.log(`Clicked text: "${text}"`);
        break;
      }
      case 'locator-visible': {
        const text = args[1];
        const visible = await page.locator(`text="${text}"`).first().isVisible().catch(() => false);
        console.log(visible ? 'VISIBLE' : 'NOT VISIBLE');
        break;
      }
      default:
        console.error(`Unknown action: ${action}`);
        process.exit(1);
    }
  } finally {
    await browser.close();
  }
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
