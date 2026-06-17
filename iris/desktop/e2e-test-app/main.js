import { app, BrowserWindow, ipcMain } from 'electron';
console.log("process.type:", process.type);
console.log("app:", typeof app);
console.log("BrowserWindow:", typeof BrowserWindow);
if (app) {
  app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 300, height: 200 });
    win.loadURL('data:text/html,<h1>Test</h1>');
    console.log("Window created!");
    setTimeout(() => app.quit(), 1000);
  });
} else {
  console.log("app is undefined");
  process.exit(1);
}
