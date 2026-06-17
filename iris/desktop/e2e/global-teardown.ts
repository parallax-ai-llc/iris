import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  const screenshotDir = path.resolve(process.cwd(), 'tmp/test-screenshots');
  if (fs.existsSync(screenshotDir)) {
    fs.rmSync(screenshotDir, { recursive: true, force: true });
    console.log('\n Test screenshots cleaned up.');
  }
}
