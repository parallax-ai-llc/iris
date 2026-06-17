console.log("START process.type:", process.type);
const e = require('electron');
console.log("require electron:", typeof e, String(e).slice(0, 50));

// Use process.once('loaded') which fires when Electron's module system is ready
process.once('loaded', () => {
  console.log("LOADED - process.type:", process.type);
  const e2 = require('electron');
  console.log("LOADED - require:", typeof e2, typeof e2?.app);
});

// Chromium ready event
if (typeof __electronBinding !== 'undefined') {
  console.log("__electronBinding exists!");
}

setTimeout(() => {
  const e3 = require('electron');
  console.log("2s later - require:", typeof e3, typeof e3?.app);
  process.exit(0);
}, 2000);
